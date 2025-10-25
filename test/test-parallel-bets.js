const io = require('socket.io-client');

const API_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'replace'; // Remplacer par votre vrai token

function placeBet(betNumber) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Créer une connexion Socket.IO
    const socket = io(API_URL, {
      auth: {
        token: AUTH_TOKEN
      },
      transports: ['websocket'],
      reconnection: false
    });

    socket.on('connect', () => {
      console.log(`🔌 Bet #${betNumber} connected (socket: ${socket.id})`);

      // Placer le pari
      socket.emit('bet:place', {
        amount: 0.01,
        currency: 'NANUSD'
      }, (response) => {
        const duration = Date.now() - startTime;
        const sid = socket.id; // Sauvegarder avant disconnect
        socket.disconnect();

        resolve({
          betNumber,
          response,
          duration,
          socketId: sid
        });
      });
    });

    socket.on('connect_error', (error) => {
      reject({
        betNumber,
        error: error.message
      });
    });

    socket.on('bet:error', (error) => {
      console.log(`❌ Bet #${betNumber} error event:`, error);
    });

    // Timeout après 10 secondes
    setTimeout(() => {
      socket.disconnect();
      reject({
        betNumber,
        error: 'Timeout'
      });
    }, 10000);
  });
}

async function testParallelBets() {
  console.log('🧪 Testing 2 parallel bet requests...\n');

  // Lancer 2 paris en parallèle
  const promises = [
    placeBet(1),
    placeBet(2)
  ];

  try {
    const results = await Promise.all(promises);

    console.log('\n📊 RESULTS:\n');

    results.forEach(result => {
      console.log(`Bet #${result.betNumber}:`);
      console.log(`  Socket ID: ${result.socketId}`);
      console.log(`  Duration: ${result.duration}ms`);
      console.log(`  Success: ${result.response.success}`);
      console.log(`  Error: ${result.response.error || 'none'}`);
      console.log(`  Code: ${result.response.code || 'none'}`);
      if (result.response.betId) {
        console.log(`  Bet ID: ${result.response.betId}`);
      }
      console.log('');
    });

    const successful = results.filter(r => r.response.success);
    const failed = results.filter(r => !r.response.success);

    console.log('='.repeat(50));
    console.log('📈 SUMMARY:');
    console.log(`  Successful: ${successful.length}`);
    console.log(`  Failed: ${failed.length}`);
    console.log('='.repeat(50));

    if (successful.length === 2) {
      console.log('\n⚠️  Both bets succeeded - This is expected if game is in betting phase');
    } else if (successful.length === 1) {
      console.log('\n✅ PASS: Only one bet succeeded');
      const failureReasons = failed.map(f => f.response.code).join(', ');
      console.log(`   Failure reasons: ${failureReasons}`);
    } else {
      console.log('\n❌ No bet succeeded');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testParallelBets();
