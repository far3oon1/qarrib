// Legacy-shape mapper: frontend pages expect {id, serviceType, amount,
// address, patient:{name}, nurse:{name}, nurseId, patientId} while Mongoose
// uses {_id, service ref, finalPrice, location, assignedNurse}.
const shapeOffer = (o, nurseMap) => {
  nurseMap = nurseMap || {};
  const n = o.nurse && (nurseMap[String(o.nurse._id || o.nurse)] || o.nurse);
  return {
    id: String(o._id),
    price: o.price,
    status: o.status,
    notes: o.notes || null,
    createdAt: o.createdAt,
    nurse: n ? { id: String(n._id || n.id || n), name: n.fullName || n.name || '' } : null
  };
};

const shapeOrder = (o) => {
  const obj = typeof o.toObject === 'function' ? o.toObject() : { ...o };
  const service = obj.service || null;
  const patient = obj.patient || null;
  const nurse = obj.assignedNurse || null;
  const offers = (obj.offers || []).map((x) => shapeOffer(x));
  const latestOffer = offers.length ? offers[offers.length - 1] : null;

  const loc = obj.location || {};
  const coords = loc.coordinates || {};
  return {
    ...obj,
    id: String(obj._id),
    serviceType: (service && (service.nameAr || service.name)) || 'تمريض منزلي',
    amount: obj.finalPrice != null ? obj.finalPrice : (latestOffer ? latestOffer.price : 0),
    hasPrice: obj.finalPrice != null,
    address: loc.address || '',
    governorate: loc.governorate || '',
    city: loc.city || '',
    location: { ...loc, lat: coords.lat != null ? coords.lat : (loc.lat != null ? loc.lat : null), lng: coords.lng != null ? coords.lng : (loc.lng != null ? loc.lng : null) },
    patient: patient ? {
      ...(typeof patient === 'object' ? patient : {}),
      id: String((patient._id || patient.id || patient)),
      name: patient.fullName || patient.name || ''
    } : null,
    patientId: patient ? String(patient._id || patient.id || patient) : null,
    nurse: nurse ? {
      ...(typeof nurse === 'object' ? nurse : {}),
      id: String((nurse._id || nurse.id || nurse)),
      name: nurse.fullName || nurse.name || ''
    } : null,
    nurseId: nurse ? String(nurse._id || nurse.id || nurse) : null,
    offers
  };
};

const shapeUser = (u) => {
  const obj = typeof u.toObject === 'function' ? u.toObject() : { ...u };
  return {
    ...obj,
    id: String(obj._id),
    name: obj.fullName,
    isVerified: obj.status === 'approved' || obj.status === 'active'
  };
};

module.exports = { shapeOrder, shapeUser, shapeOffer };
