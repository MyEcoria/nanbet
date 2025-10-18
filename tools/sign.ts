import { tools } from 'nanocurrency-web'

const nanoAddress = 'nano_1pu7p5n3ghq1i1p4rhmek41f5add1uh34xpb94nkbxe8g4a6x1p69emk8y1d'
const privateKey = '3be4fc2ef3f3b7374e6fc4fb6e7bb153f8a2998b3b3dab50853eabe128024143'
const data = 'Login-74c5ed2a-97eb-49d3-8801-011d5f22d542-1760741814353'

// Make the user sign the data
const signature = tools.sign(privateKey, data)
console.log(signature);