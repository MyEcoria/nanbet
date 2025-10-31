const io = require('socket.io-client');

const API_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'replace'; // Remplacer par votre vrai token

let socket;
let betId = null;
let crashDetectedAt = null;
let cashoutAttemptedAt = null;
let cashoutResponseAt = null;

function connect() {
  return new Promise((resolve, reject) => {
    socket = io(API_URL, {
      auth: {
        token: AUTH_TOKEN,
      },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      console.log(`🔌 Connected (socket: ${socket.id})\n`);
      resolve();
    });

    socket.on('connect_error', (error) => {
      reject(error);
    });
  });
}

function waitForBettingPhase() {
  return new Promise((resolve) => {
    console.log('⏳ Waiting for betting phase...\n');

    socket.on('game:starting', (data) => {
      console.log(`🎮 Game #${data.gameNumber} starting - betting phase active`);
      console.log(`   Betting duration: ${data.bettingDuration}s`);
      console.log(`   Server seed hash: ${data.serverSeedHash.substring(0, 16)}...\n`);
      resolve(data);
    });

    // Request current state in case we're already in betting phase
    socket.emit('game:getState', (response) => {
      if (response.success && response.state.status === 'betting') {
        console.log(`🎮 Game #${response.state.gameNumber} already in betting phase\n`);
        resolve(response.state);
      }
    });
  });
}

function placeBet() {
  return new Promise((resolve, reject) => {
    console.log('💰 Placing bet...\n');

    socket.emit(
      'bet:place',
      {
        amount: 0.01,
        currency: 'NANUSD',
      },
      (response) => {
        if (response.success) {
          betId = response.betId;
          console.log(`✅ Bet placed successfully`);
          console.log(`   Bet ID: ${betId}\n`);
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to place bet'));
        }
      }
    );
  });
}

function setupCrashListener() {
  return new Promise((resolve) => {
    console.log('👂 Listening for crash event...\n');

    socket.on('game:started', (data) => {
      console.log(`🚀 Game started at ${new Date(data.startTime).toISOString()}\n`);
    });

    socket.on('game:tick', (data) => {
      process.stdout.write(`\r📈 Current multiplier: ${data.currentMultiplier.toFixed(2)}x`);
    });

    socket.on('game:crashed', (data) => {
      crashDetectedAt = Date.now();
      console.log(`\n\n💥 CRASH DETECTED at ${data.crashPoint.toFixed(2)}x`);
      console.log(`   Game #${data.gameNumber}`);
      console.log(`   Crash detected at: ${crashDetectedAt}ms\n`);

      // IMMEDIATELY attempt cashout
      console.log('⚡ IMMEDIATELY attempting cashout after crash...\n');
      cashoutAttemptedAt = Date.now();

      socket.emit('bet:cashout', (response) => {
        cashoutResponseAt = Date.now();
        const latency = cashoutResponseAt - cashoutAttemptedAt;

        console.log('📨 Cashout response received:');
        console.log(`   Latency: ${latency}ms`);
        console.log(`   Success: ${response.success}`);
        console.log(`   Error: ${response.error || 'none'}`);
        console.log(`   Code: ${response.code || 'none'}\n`);

        resolve({
          crashData: data,
          cashoutResponse: response,
          timing: {
            crashDetectedAt,
            cashoutAttemptedAt,
            cashoutResponseAt,
            latency,
          },
        });
      });
    });
  });
}

async function runTest() {
  console.log('🧪 TEST: Cashout Immediately After Crash Detection\n');
  console.log('='.repeat(60));
  console.log('This test verifies that cashouts are rejected after a crash');
  console.log('even when attempted immediately upon crash detection.');
  console.log('='.repeat(60));
  console.log('\n');

  try {
    // Step 1: Connect
    await connect();

    // Step 2: Setup crash listener BEFORE betting
    const crashPromise = setupCrashListener();

    // Step 3: Wait for betting phase
    await waitForBettingPhase();

    // Step 4: Place bet
    await placeBet();

    // Step 5: Wait for crash and cashout attempt
    const result = await crashPromise;

    // Step 6: Analyze results
    console.log('='.repeat(60));
    console.log('📊 TEST RESULTS\n');

    console.log('Timing Analysis:');
    console.log(`  Crash detected at:    ${result.timing.crashDetectedAt}ms`);
    console.log(`  Cashout attempted at: ${result.timing.cashoutAttemptedAt}ms`);
    console.log(`  Cashout response at:  ${result.timing.cashoutResponseAt}ms`);
    console.log(
      `  Reaction time:        ${result.timing.cashoutAttemptedAt - result.timing.crashDetectedAt}ms`
    );
    console.log(`  Network latency:      ${result.timing.latency}ms\n`);

    console.log('Crash Information:');
    console.log(`  Game Number:    ${result.crashData.gameNumber}`);
    console.log(`  Crash Point:    ${result.crashData.crashPoint.toFixed(2)}x`);
    console.log(`  Server Seed:    ${result.crashData.serverSeed.substring(0, 16)}...\n`);

    console.log('Cashout Attempt:');
    console.log(`  Success:        ${result.cashoutResponse.success}`);
    console.log(`  Error:          ${result.cashoutResponse.error || 'none'}`);
    console.log(`  Code:           ${result.cashoutResponse.code || 'none'}\n`);

    console.log('='.repeat(60));

    // Verify the result
    if (!result.cashoutResponse.success) {
      console.log('✅ TEST PASSED: Cashout was correctly rejected after crash\n');
      console.log('   Expected behavior: The system prevents cashouts after crash');
      console.log(`   Rejection reason: ${result.cashoutResponse.error}\n`);

      socket.disconnect();
      process.exit(0);
    } else {
      console.log('❌ TEST FAILED: Cashout succeeded after crash!\n');
      console.log('   SECURITY ISSUE: Players can cashout after seeing crash point');
      console.log(`   Profit gained: ${result.cashoutResponse.profit}\n`);
      console.log('   This is a critical race condition vulnerability!\n');

      socket.disconnect();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    if (socket) socket.disconnect();
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted');
  if (socket) socket.disconnect();
  process.exit(130);
});

runTest();
