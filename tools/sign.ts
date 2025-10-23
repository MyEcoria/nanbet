import { tools } from 'nanocurrency-web';

const _nanoAddress = 'nano_1pu7p5n3ghq1i1p4rhmek41f5add1uh34xpb94nkbxe8g4a6x1p69emk8y1d';
const privateKey = '3be4fc2ef3f3b7374e6fc4fb6e7bb153f8a2998b3b3dab50853eabe128024143';
const data = 'Login-8f19180f-89af-4ad7-8de7-fd10c0006ca1-1761082988211';

// Make the user sign the data
const signature = tools.sign(privateKey, data);
console.log(signature);
