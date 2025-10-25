const http = require('http');

const API_URL = 'localhost';
const API_PORT = 3000;
const AUTH_TOKEN = 'replace'; // Remplacer par votre vrai token

function makeWithdrawalRequest(requestNumber) {
  const data = JSON.stringify({
    currency: 'NANUSD',
    amount: 0.01,
    destinationAddress: 'usd_1rtdak43tizb6b5x8qoxh1rd8spuagt99yjohdxxupygqe3h6cpx3rpph1kg'
  });

  const options = {
    hostname: API_URL,
    port: API_PORT,
    path: '/withdrawal',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  };

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const response = JSON.parse(body);
          resolve({
            requestNumber,
            statusCode: res.statusCode,
            response,
            duration
          });
        } catch (error) {
          resolve({
            requestNumber,
            statusCode: res.statusCode,
            response: body,
            duration
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({
        requestNumber,
        error: error.message
      });
    });

    req.write(data);
    req.end();
  });
}

async function testParallelWithdrawals() {
  console.log('🧪 Testing 2 parallel withdrawal requests...\n');

  // Lancer 2 requêtes en parallèle
  const promises = [
    makeWithdrawalRequest(1),
    makeWithdrawalRequest(2)
  ];

  try {
    const results = await Promise.all(promises);

    console.log('📊 RESULTS:\n');

    results.forEach(result => {
      console.log(`Request #${result.requestNumber}:`);
      console.log(`  Status: ${result.statusCode}`);
      console.log(`  Duration: ${result.duration}ms`);
      console.log(`  Success: ${result.response.success}`);
      console.log(`  Message: ${result.response.message || ''}`);
      console.log(`  Error: ${result.response.error || 'none'}`);
      console.log('');
    });

    const successful = results.filter(r => r.statusCode === 200 && r.response.success);
    const failed = results.filter(r => r.statusCode !== 200 || !r.response.success);

    console.log('='.repeat(50));
    console.log('📈 SUMMARY:');
    console.log(`  Successful: ${successful.length}`);
    console.log(`  Failed: ${failed.length}`);
    console.log('='.repeat(50));

    if (successful.length === 1) {
      console.log('\n✅ PASS: Only one withdrawal succeeded (race condition protected)');
    } else if (successful.length > 1) {
      console.log('\n❌ FAIL: Multiple withdrawals succeeded (race condition detected!)');
    } else {
      console.log('\n⚠️  WARNING: No withdrawal succeeded');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testParallelWithdrawals();
