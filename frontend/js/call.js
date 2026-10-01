(function () {
  var pc = null;
  var localStream = null;
  var remoteStream = null;
  var socket = null;
  var listeningSocket = null;
  var currentCall = null;
  var pendingIceCandidates = [];
  var ringtoneInterval = null;
  var callTimeout = null;
  var signalPollInterval = null;
  var signalPollInFlight = false;
  var isMuted = false;
  var isSpeaker = false;

  var ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  function usesApiSignaling() {
    var host = String(window.location.hostname || '').toLowerCase();
    if (host.endsWith('.vercel.app') || host.endsWith('.github.io')) return true;
    try {
      var apiHost = new URL(api.baseURL, window.location.href).hostname.toLowerCase();
      return apiHost.endsWith('.vercel.app');
    } catch (e) {
      return false;
    }
  }

  function getSocket() {
    if (usesApiSignaling()) return null;
    if (socket) {
      setupSocketListeners(socket);
      return socket;
    }
    if (typeof window.QarribSocket !== 'undefined') {
      socket = window.QarribSocket.getSocket();
      if (socket) {
        setupSocketListeners(socket);
        return socket;
      }
    }
    if (typeof io === 'undefined') return null;
    try {
      var backendUrl = window.QARRIB_BACKEND_URL || 'https://qarrib.onrender.com';
      socket = io(backendUrl, { auth: { token: localStorage.getItem('token') } });
      setupSocketListeners(socket);
      return socket;
    } catch (e) { return null; }
  }

  function waitForSocket(s) {
    if (s.connected) return Promise.resolve(s);
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error('Socket connection timed out'));
      }, 15000);
      function cleanup() {
        clearTimeout(timeout);
        s.off('connect', onConnect);
      }
      function onConnect() {
        cleanup();
        resolve(s);
      }
      s.on('connect', onConnect);
    });
  }

  function setupSocketListeners(s) {
    if (listeningSocket === s) return;
    listeningSocket = s;
    ['call_offer', 'call_answer', 'call_ice', 'call_end', 'call_reject', 'call_busy'].forEach(function (event) {
      s.on(event, function (data) { handleCallSignal(event, data, s); });
    });
  }

  function handleCallSignal(event, data) {
    if (event === 'call_offer') {
      if (currentCall && currentCall.state !== 'idle') {
        sendCallSignal('call_busy', { to: data.from }).catch(function () {});
        return;
      }
      pendingIceCandidates = [];
      currentCall = { state: 'incoming', from: data.from, offer: data.offer };
      showIncomingCall(data.from);
      return;
    }

    if (event === 'call_answer') {
      if (!currentCall || currentCall.state !== 'calling') return;
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(function () {
          addPendingIceCandidates();
          if (!currentCall || currentCall.state !== 'calling') return;
          currentCall.state = 'connected';
          clearTimeout(callTimeout);
          hideCallUI();
          showConnectedUI(currentCall.name);
        }).catch(function () {
          showAlert('تعذر إنشاء اتصال صوتي / Could not establish audio connection', 'error');
          endCall(false);
        });
      }
      return;
    }

    if (event === 'call_ice') {
      if (!data.candidate) return;
      if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
        pendingIceCandidates.push(data.candidate);
        return;
      }
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
      return;
    }

    if (event === 'call_end') {
      endCall(false);
      return;
    }

    if (event === 'call_reject') {
      if (currentCall && currentCall.state === 'calling') {
        showAlert('تم رفض المكالمة / Call rejected', 'error');
        endCall(false);
      }
      return;
    }

    if (event === 'call_busy') {
      if (currentCall && currentCall.state === 'calling') {
        showAlert('الطرف الآخر مشغول / The other party is busy', 'error');
        endCall(false);
      }
    }
  }

  function sendCallSignal(event, data) {
    if (usesApiSignaling() || !socket || !socket.connected) {
      if (typeof api === 'undefined' || !api || typeof api.request !== 'function') {
        return Promise.reject(new Error('Call signaling API is unavailable'));
      }
      var payload = {};
      Object.keys(data || {}).forEach(function (key) {
        if (key !== 'to') payload[key] = data[key];
      });
      return api.request('POST', '/calls/signals', {
        to: data && data.to,
        event: event,
        payload: payload
      });
    }
    socket.emit(event, data);
    return Promise.resolve({ success: true });
  }

  function pollCallSignals() {
    if (!usesApiSignaling() || signalPollInFlight || typeof api === 'undefined' || !api || typeof api.request !== 'function') return;
    signalPollInFlight = true;
    api.request('GET', '/calls/signals').then(function (result) {
      var signals = result && Array.isArray(result.data) ? result.data : [];
      signals.forEach(function (signal) {
        if (!signal || !signal.event || !signal.from) return;
        var data = Object.assign({ from: signal.from }, signal.payload || {});
        handleCallSignal(signal.event, data, null);
      });
    }).catch(function () {}).then(function () {
      signalPollInFlight = false;
    });
  }

  function startCallSignalPolling() {
    if (!usesApiSignaling() || signalPollInterval) return;
    pollCallSignals();
    signalPollInterval = setInterval(pollCallSignals, 2000);
  }

  function addPendingIceCandidates() {
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) return;
    var candidates = pendingIceCandidates.splice(0);
    candidates.forEach(function (candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {});
    });
  }

  function createPeerConnection() {
    pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = function (e) {
      if (e.candidate && currentCall && currentCall.from) {
        sendCallSignal('call_ice', { to: currentCall.from, candidate: e.candidate }).catch(function () {});
      }
    };

    pc.ontrack = function (e) {
      remoteStream = e.streams[0];
      var audio = document.getElementById('qarrib-remote-audio');
      if (audio) audio.srcObject = remoteStream;
    };

    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(true);
      }
    };

    if (localStream) {
      localStream.getTracks().forEach(function (track) {
        pc.addTrack(track, localStream);
      });
    }
  }

  function startCall(calleeId, calleeName) {
    var apiTransport = usesApiSignaling();
    var s = apiTransport ? null : getSocket();
    if (!apiTransport && !s) { showAlert('الاتصال غير متاح — تأكد من اتصالك بالإنترنت', 'error'); return; }
    if (currentCall) { showAlert('لديك مكالمة نشطة بالفعل', 'error'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert('المتصفح لا يدعم المكالمات الصوتية', 'error');
      return;
    }

    startCallSignalPolling();
    (apiTransport ? Promise.resolve() : waitForSocket(s)).then(function () {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }).then(function (stream) {
      localStream = stream;
      pendingIceCandidates = [];
      currentCall = { state: 'calling', from: calleeId, name: calleeName };
      createPeerConnection();
      showCallingUI(calleeName);

      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer).then(function () {
          return sendCallSignal('call_offer', { to: calleeId, offer: offer });
        }).then(function () {
          callTimeout = setTimeout(function () {
            if (currentCall && currentCall.state === 'calling') {
              showAlert('لم يتم الرد / No answer', 'error');
              endCall(false);
            }
          }, 30000);
        });
      }).catch(function () {
        showAlert('فشل إنشاء المكالمة', 'error');
        endCall(false);
      });
    }).catch(function () {
      showAlert('تعذر الاتصال أو الوصول إلى الميكروفون / Connection or microphone access failed', 'error');
      endCall(false);
    });
  }

  function answerCall() {
    if (!currentCall || currentCall.state !== 'incoming') return;
    var apiTransport = usesApiSignaling();
    var s = apiTransport ? null : getSocket();
    if (!apiTransport && !s) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert('المتصفح لا يدعم المكالمات الصوتية', 'error');
      rejectCall();
      return;
    }

    startCallSignalPolling();
    (apiTransport ? Promise.resolve() : waitForSocket(s)).then(function () {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }).then(function (stream) {
      localStream = stream;
      currentCall.state = 'connecting';
      createPeerConnection();

      return pc.setRemoteDescription(new RTCSessionDescription(currentCall.offer)).then(function () {
        addPendingIceCandidates();
        return pc.createAnswer();
      }).then(function (answer) {
        return pc.setLocalDescription(answer).then(function () {
          return sendCallSignal('call_answer', { to: currentCall.from, answer: answer });
        }).then(function () {
            hideCallUI();
            currentCall.state = 'connected';
            showConnectedUI(currentCall.name);
        });
      });
    }).catch(function () {
      showAlert('تعذر الاتصال أو الوصول إلى الميكروفون / Connection or microphone access failed', 'error');
      rejectCall();
    });
  }

  function rejectCall() {
    if (currentCall && currentCall.from) sendCallSignal('call_reject', { to: currentCall.from }).catch(function () {});
    endCall(false);
  }

  function endCall(notify) {
    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null; }
    if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }

    if (notify && currentCall && currentCall.from) {
      sendCallSignal('call_end', { to: currentCall.from }).catch(function () {});
    }

    if (pc) { pc.close(); pc = null; }
    if (localStream) {
      localStream.getTracks().forEach(function (t) { t.stop(); });
      localStream = null;
    }
    remoteStream = null;
    pendingIceCandidates = [];
    currentCall = null;
    isMuted = false;
    isSpeaker = false;
    hideCallUI();
  }

  function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(function (t) { t.enabled = !isMuted; });
    var btn = document.getElementById('qarrib-mute-btn');
    if (btn) {
      btn.textContent = isMuted ? '🔇' : '🔊';
      btn.style.opacity = isMuted ? '0.5' : '1';
    }
  }

  function toggleSpeaker() {
    isSpeaker = !isSpeaker;
    var audio = document.getElementById('qarrib-remote-audio');
    if (audio) audio.muted = !isSpeaker;
    var btn = document.getElementById('qarrib-speaker-btn');
    if (btn) {
      btn.textContent = isSpeaker ? '🔈' : '🔉';
      btn.style.opacity = isSpeaker ? '0.5' : '1';
    }
  }

  function playRingtone() {
    if (ringtoneInterval) return;
    var ctx = null;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    var playBeep = function () {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    };
    playBeep();
    ringtoneInterval = setInterval(playBeep, 1000);
  }

  function stopRingtone() {
    if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
  }

  function ensureCallUI() {
    if (document.getElementById('qarrib-call-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'qarrib-call-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(11,95,90,0.97);flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,sans-serif;';
    overlay.innerHTML =
      '<div id="qarrib-call-avatar" style="width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:48px;margin-bottom:20px;">📞</div>' +
      '<div id="qarrib-call-name" style="font-size:24px;font-weight:700;margin-bottom:8px;"></div>' +
      '<div id="qarrib-call-status" style="font-size:16px;opacity:0.7;margin-bottom:40px;"></div>' +
      '<div id="qarrib-call-timer" style="font-size:14px;opacity:0.5;margin-bottom:40px;"></div>' +
      '<div id="qarrib-call-controls" style="display:flex;gap:20px;">' +
        '<button id="qarrib-mute-btn" onclick="QarribCall.toggleMute()" style="width:56px;height:56px;border-radius:50%;border:0;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer;">🔊</button>' +
        '<button id="qarrib-speaker-btn" onclick="QarribCall.toggleSpeaker()" style="width:56px;height:56px;border-radius:50%;border:0;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer;">🔉</button>' +
        '<button id="qarrib-end-btn" onclick="QarribCall.endCall(true)" style="width:56px;height:56px;border-radius:50%;border:0;background:#dc2626;color:#fff;font-size:24px;cursor:pointer;">📵</button>' +
      '</div>' +
      '<div id="qarrib-call-actions" style="display:flex;gap:20px;margin-top:30px;">' +
        '<button id="qarrib-answer-btn" onclick="QarribCall.answerCall()" style="display:none;padding:14px 40px;border-radius:30px;border:0;background:#16a34a;color:#fff;font-size:18px;font-weight:700;cursor:pointer;">📞 رد / Answer</button>' +
        '<button id="qarrib-reject-btn" onclick="QarribCall.rejectCall()" style="display:none;padding:14px 40px;border-radius:30px;border:0;background:#dc2626;color:#fff;font-size:18px;font-weight:700;cursor:pointer;">📵 رفض / Reject</button>' +
      '</div>' +
      '<audio id="qarrib-remote-audio" autoplay></audio>';
    document.body.appendChild(overlay);
  }

  function showCallingUI(name) {
    ensureCallUI();
    var overlay = document.getElementById('qarrib-call-overlay');
    overlay.style.display = 'flex';
    document.getElementById('qarrib-call-name').textContent = name || '';
    document.getElementById('qarrib-call-status').textContent = 'جارٍ الاتصال… / Calling…';
    document.getElementById('qarrib-call-timer').textContent = '';
    document.getElementById('qarrib-call-controls').style.display = 'none';
    document.getElementById('qarrib-call-actions').style.display = 'none';
    document.getElementById('qarrib-answer-btn').style.display = 'none';
    document.getElementById('qarrib-reject-btn').style.display = 'none';
  }

  function showIncomingCall(fromId) {
    ensureCallUI();
    var overlay = document.getElementById('qarrib-call-overlay');
    overlay.style.display = 'flex';
    document.getElementById('qarrib-call-avatar').textContent = '📞';
    document.getElementById('qarrib-call-name').textContent = 'مكالمة واردة / Incoming call';
    document.getElementById('qarrib-call-status').textContent = 'من: ' + fromId;
    document.getElementById('qarrib-call-timer').textContent = '';
    document.getElementById('qarrib-call-controls').style.display = 'none';
    document.getElementById('qarrib-call-actions').style.display = 'flex';
    document.getElementById('qarrib-answer-btn').style.display = 'inline-block';
    document.getElementById('qarrib-reject-btn').style.display = 'inline-block';
    playRingtone();
  }

  function showConnectedUI(name) {
    ensureCallUI();
    var overlay = document.getElementById('qarrib-call-overlay');
    overlay.style.display = 'flex';
    document.getElementById('qarrib-call-name').textContent = name || '';
    document.getElementById('qarrib-call-status').textContent = 'متصل ✅';
    document.getElementById('qarrib-call-controls').style.display = 'flex';
    document.getElementById('qarrib-call-actions').style.display = 'none';
    document.getElementById('qarrib-answer-btn').style.display = 'none';
    document.getElementById('qarrib-reject-btn').style.display = 'none';
    stopRingtone();
    startCallTimer();
  }

  var callTimerInterval = null;
  var callStartTime = null;

  function startCallTimer() {
    callStartTime = Date.now();
    var timerEl = document.getElementById('qarrib-call-timer');
    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = setInterval(function () {
      if (!callStartTime) return;
      var secs = Math.floor((Date.now() - callStartTime) / 1000);
      var m = Math.floor(secs / 60);
      var s = secs % 60;
      if (timerEl) timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function hideCallUI() {
    var overlay = document.getElementById('qarrib-call-overlay');
    if (overlay) overlay.style.display = 'none';
    stopRingtone();
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    callStartTime = null;
  }

  window.QarribCall = {
    version: 4,
    initialize: function () {
      if (usesApiSignaling()) {
        startCallSignalPolling();
        return null;
      }
      return getSocket();
    },
    startCall: startCall,
    answerCall: answerCall,
    rejectCall: rejectCall,
    endCall: endCall,
    toggleMute: toggleMute,
    toggleSpeaker: toggleSpeaker,
    isActive: function () { return currentCall !== null && currentCall.state !== 'idle'; }
  };
})();
