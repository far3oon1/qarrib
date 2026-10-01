(function () {
  var pc = null;
  var localStream = null;
  var remoteStream = null;
  var socket = null;
  var currentCall = null;
  var ringtoneInterval = null;
  var callTimeout = null;
  var isMuted = false;
  var isSpeaker = false;

  var ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  function getSocket() {
    if (socket && socket.connected) return socket;
    if (typeof io === 'undefined') return null;
    try {
      var backendUrl = window.QARRIB_BACKEND_URL || 'https://qarrib.onrender.com';
      socket = io(backendUrl, { auth: { token: localStorage.getItem('token') } });
      setupSocketListeners(socket);
      return socket;
    } catch (e) { return null; }
  }

  function setupSocketListeners(s) {
    s.on('call_offer', function (data) {
      if (currentCall && currentCall.state !== 'idle') {
        s.emit('call_busy', { to: data.from });
        return;
      }
      currentCall = { state: 'incoming', from: data.from, offer: data.offer };
      showIncomingCall(data.from);
    });

    s.on('call_answer', function (data) {
      if (!currentCall || currentCall.state !== 'calling') return;
      currentCall.state = 'connected';
      clearTimeout(callTimeout);
      hideCallUI();
      showConnectedUI();
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(function () {});
      }
    });

    s.on('call_ice', function (data) {
      if (pc && data.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function () {});
      }
    });

    s.on('call_end', function () {
      endCall(true);
    });

    s.on('call_reject', function () {
      if (currentCall && currentCall.state === 'calling') {
        showAlert('تم رفض المكالمة / Call rejected', 'error');
        endCall(false);
      }
    });

    s.on('call_busy', function () {
      if (currentCall && currentCall.state === 'calling') {
        showAlert('الطرف الآخر مشغول / The other party is busy', 'error');
        endCall(false);
      }
    });
  }

  function createPeerConnection() {
    pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = function (e) {
      if (e.candidate && currentCall && currentCall.from) {
        var s = getSocket();
        if (s) s.emit('call_ice', { to: currentCall.from, candidate: e.candidate });
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
    var s = getSocket();
    if (!s) { showAlert('الاتصال غير متاح — تأكد من اتصالك بالإنترنت', 'error'); return; }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      localStream = stream;
      currentCall = { state: 'calling', from: calleeId, name: calleeName };
      createPeerConnection();
      showCallingUI(calleeName);

      pc.createOffer().then(function (offer) {
        pc.setLocalDescription(offer).then(function () {
          s.emit('call_offer', { to: calleeId, offer: offer });
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
      showAlert('الميكروفون مطلوب للمكالمات / Microphone access required', 'error');
    });
  }

  function answerCall() {
    if (!currentCall || currentCall.state !== 'incoming') return;
    var s = getSocket();
    if (!s) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      localStream = stream;
      currentCall.state = 'connected';
      createPeerConnection();
      hideCallUI();
      showConnectedUI(currentCall.name);

      pc.setRemoteDescription(new RTCSessionDescription(currentCall.offer)).then(function () {
        pc.createAnswer().then(function (answer) {
          pc.setLocalDescription(answer).then(function () {
            s.emit('call_answer', { to: currentCall.from, answer: answer });
          });
        });
      });
    }).catch(function () {
      showAlert('الميكروفون مطلوب للمكالمات / Microphone access required', 'error');
      rejectCall();
    });
  }

  function rejectCall() {
    var s = getSocket();
    if (s && currentCall && currentCall.from) {
      s.emit('call_reject', { to: currentCall.from });
    }
    endCall(false);
  }

  function endCall(notify) {
    if (callTimeout) { clearTimeout(callTimeout); callTimeout = null; }
    if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }

    var s = getSocket();
    if (notify && s && currentCall && currentCall.from) {
      s.emit('call_end', { to: currentCall.from });
    }

    if (pc) { pc.close(); pc = null; }
    if (localStream) {
      localStream.getTracks().forEach(function (t) { t.stop(); });
      localStream = null;
    }
    remoteStream = null;
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
    startCall: startCall,
    answerCall: answerCall,
    rejectCall: rejectCall,
    endCall: endCall,
    toggleMute: toggleMute,
    toggleSpeaker: toggleSpeaker,
    isActive: function () { return currentCall !== null && currentCall.state !== 'idle'; }
  };
})();
