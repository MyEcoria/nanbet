const io = require('socket.io-client');

const API_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'replace'; // Remplacer par votre vrai token

const NUM_PARALLEL_ATTEMPTS = 10; // Nombre de tentatives de cashout simultanées

let socket;
let betId = null;

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
      console.log(`🎮 Game #${data.gameNumber} starting - betting phase active\n`);
      resolve(data);
    });

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
    console.log('💰 Placing bet of 0.01 NANUSD...\n');

    socket.emit(
      'bet:place',
      {
        amount: 0.01,
        currency: 'NANUSD',
      },
      (response) => {
        if (response.success) {
          betId = response.betId;
          console.log(`✅ Bet placed successfully (ID: ${betId})\n`);
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to place bet'));
        }
      }
    );
  });
}

function attemptCashout(attemptNumber) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    socket.emit('bet:cashout', (response) => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      resolve({
        attemptNumber,
        response,
        startTime,
        endTime,
        duration,
      });
    });
  });
}

function setupCrashListener() {
  return new Promise((resolve) => {
    console.log('👂 Listening for crash event...\n');

    let lastMultiplier = 1.0;

    socket.on('game:started', (data) => {
      console.log(`🚀 Game started!\n`);
    });

    socket.on('game:tick', (data) => {
      lastMultiplier = data.currentMultiplier;
      process.stdout.write(`\r📈 Current multiplier: ${data.currentMultiplier.toFixed(2)}x`);
    });

    socket.on('game:crashed', async (data) => {
      const crashDetectedAt = Date.now();
      console.log(`\n\n💥 CRASH DETECTED at ${data.crashPoint.toFixed(2)}x\n`);

      // IMMEDIATELY spam multiple cashout attempts in parallel
      console.log(`⚡ Attempting ${NUM_PARALLEL_ATTEMPTS} simultaneous cashouts...\n`);

      const promises = [];
      for (let i = 1; i <= NUM_PARALLEL_ATTEMPTS; i++) {
        promises.push(attemptCashout(i));
      }

      const results = await Promise.all(promises);
      const firstCashoutAt = Math.min(...results.map((r) => r.startTime));
      const allFinishedAt = Math.max(...results.map((r) => r.endTime));

      resolve({
        crashData: data,
        lastMultiplier,
        cashoutResults: results,
        timing: {
          crashDetectedAt,
          firstCashoutAt,
          allFinishedAt,
          reactionTime: firstCashoutAt - crashDetectedAt,
          totalDuration: allFinishedAt - firstCashoutAt,
        },
      });
    });
  });
}

async function runTest() {
  console.log('🧪 TEST: Race Condition - Multiple Parallel Cashouts After Crash\n');
  console.log('='.repeat(70));
  console.log(`This test attempts ${NUM_PARALLEL_ATTEMPTS} simultaneous cashouts immediately after crash`);
  console.log('to verify there are no race condition vulnerabilities.');
  console.log('='.repeat(70));
  console.log('\n');

  try {
    // Step 1: Connect
    await connect();

    // Step 2: Setup crash listener
    const crashPromise = setupCrashListener();

    // Step 3: Wait for betting phase
    await waitForBettingPhase();

    // Step 4: Place bet
    await placeBet();

    // Step 5: Wait for crash and cashout attempts
    const result = await crashPromise;

    // Step 6: Analyze results
    console.log('\n' + '='.repeat(70));
    console.log('📊 DETAILED RESULTS\n');

    console.log('⏱️  Timing:');
    console.log(`  Crash detected at:      ${result.timing.crashDetectedAt}ms`);
    console.log(`  First cashout at:       ${result.timing.firstCashoutAt}ms`);
    console.log(`  All cashouts finished:  ${result.timing.allFinishedAt}ms`);
    console.log(`  Reaction time:          ${result.timing.reactionTime}ms`);
    console.log(`  Total burst duration:   ${result.timing.totalDuration}ms\n`);

    console.log('🎮 Game Info:');
    console.log(`  Game Number:        ${result.crashData.gameNumber}`);
    console.log(`  Crash Point:        ${result.crashData.crashPoint.toFixed(2)}x`);
    console.log(`  Last seen multi:    ${result.lastMultiplier.toFixed(2)}x\n`);

    console.log('💸 Cashout Attempts:\n');

    let successCount = 0;
    let failCount = 0;
    const errors = {};

    result.cashoutResults.forEach((attempt) => {
      const status = attempt.response.success ? '✅ SUCCESS' : '❌ FAILED';
      const icon = attempt.response.success ? '💰' : '⛔';

      console.log(`  ${icon} Attempt #${attempt.attemptNumber}: ${status} (${attempt.duration}ms)`);

      if (attempt.response.success) {
        console.log(`     Profit: ${attempt.response.profit}`);
        console.log(`     Cashed out at: ${attempt.response.cashOutAt}x`);
        successCount++;
      } else {
        console.log(`     Error: ${attempt.response.error}`);
        console.log(`     Code: ${attempt.response.code}`);
        failCount++;

        const errorCode = attempt.response.code || 'UNKNOWN';
        errors[errorCode] = (errors[errorCode] || 0) + 1;
      }
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('📈 SUMMARY\n');
    console.log(`  Total attempts:     ${NUM_PARALLEL_ATTEMPTS}`);
    console.log(`  Successful:         ${successCount} (${((successCount / NUM_PARALLEL_ATTEMPTS) * 100).toFixed(1)}%)`);
    console.log(`  Failed:             ${failCount} (${((failCount / NUM_PARALLEL_ATTEMPTS) * 100).toFixed(1)}%)\n`);

    if (Object.keys(errors).length > 0) {
      console.log('  Error breakdown:');
      for (const [code, count] of Object.entries(errors)) {
        console.log(`    ${code}: ${count}`);
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('\n');

    // Verdict
    if (successCount === 0) {
      console.log('✅ TEST PASSED: All cashout attempts were correctly rejected\n');
      console.log('   ✓ No race condition detected');
      console.log('   ✓ System properly prevents post-crash cashouts');
      console.log('   ✓ Transaction safety verified\n');

      socket.disconnect();
      process.exit(0);
    } else if (successCount === 1) {
      console.log('⚠️  TEST WARNING: One cashout succeeded\n');
      console.log('   This might be a timing issue where the cashout was');
      console.log('   processed before the crash was fully registered.');
      console.log('   Manual review recommended.\n');

      socket.disconnect();
      process.exit(2);
    } else {
      console.log('❌ TEST FAILED: Multiple cashouts succeeded after crash!\n');
      console.log('   🚨 CRITICAL SECURITY VULNERABILITY DETECTED');
      console.log(`   🚨 ${successCount} cashouts succeeded after crash detection`);
      console.log('   🚨 Race condition allows exploitation\n');
      console.log('   Immediate fixes required:\n');
      console.log('   - Add stricter game state checks');
      console.log('   - Implement cashout cutoff before crash broadcast');
      console.log('   - Add transaction-level locks\n');

      socket.disconnect();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
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
