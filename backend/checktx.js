const mongoose = require('mongoose');
const Wallet = require('./src/models/Wallet');

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/qarrib');
  const txs = await Wallet.find({}).limit(5).select('type amount paymentMethod status');
  console.log('Recent transactions:');
  console.log(JSON.stringify(txs, null, 2));
  
  const total = await Wallet.countDocuments();
  console.log('\nTotal transactions:', total);
  
  const withMethod = await Wallet.countDocuments({ paymentMethod: { $ne: null } });
  console.log('With paymentMethod:', withMethod);
  
  await mongoose.connection.close();
}

main().catch(e => { console.error(e); process.exit(1); });
