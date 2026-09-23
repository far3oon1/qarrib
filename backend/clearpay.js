const mongoose = require('mongoose');
const Wallet = require('./src/models/Wallet');

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/qarrib');
  console.log('Connected to MongoDB');
  
  const result = await Wallet.updateMany(
    { paymentMethod: { $ne: null } },
    { $set: { paymentMethod: null } }
  );
  console.log('Updated', result.modifiedCount, 'transactions to null paymentMethod');
  
  await mongoose.connection.close();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
