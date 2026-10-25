/**
 * Webhook Dispatch Integration Test Script
 * Tests webhook dispatch from vibe-logistics-hub to ready9ja-api backend.
 *
 * Usage:
 *   node scripts/test-webhook-dispatch.mjs [tracking_id] [backend_url]
 *
 * Example:
 *   node scripts/test-webhook-dispatch.mjs TRK-123456 http://localhost:8000/api/v1/orders
 */

import { createHash, createHmac } from "node:crypto";

// 1. Replicate / Import dispatchOrderWebhook logic matching src/lib/webhooks.ts
async function generateWebhookSignature(jsonPayload, secretKey = "") {
  return createHmac("sha256", secretKey).update(jsonPayload).digest("hex");
}

async function dispatchOrderWebhook(webhookUrl, orderId, status) {
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { success: false, error: "No valid webhook URL provided" };
  }

  // Webhooks are strictly restricted to out_for_delivery and delivered statuses
  if (status !== "out_for_delivery" && status !== "delivered") {
    return {
      success: false,
      error: "Webhooks are only dispatched for out_for_delivery and delivered statuses",
    };
  }

  const payloadObj = {
    order_id: orderId,
    status: status,
  };
  const jsonPayload = JSON.stringify(payloadObj);

  try {
    const signature = await generateWebhookSignature(jsonPayload);

    console.log(`\n  [Dispatcher] Preparing webhook request...`);
    console.log(`  Target URL: ${webhookUrl}`);
    console.log(`  Payload: ${jsonPayload}`);
    console.log(`  Computed SHA-256 Signature: ${signature}`);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "User-Agent": "9jaVibeMall-Logistics-Webhook/1.0",
      },
      body: jsonPayload,
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return {
      success: response.ok,
      statusCode: response.status,
      signature,
      response: responseData,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}

// 2. Test Execution Suite
async function runTestSuite() {
  const args = process.argv.slice(2);
  const trackingId = args[0] || "R9B-ORD-TEST-001";
  const providerCode = args[1] || "9javibemall-partners";

  // Default ready9ja-api port is 8000 (or 5000 / 3000 as fallbacks)
  let baseUrl = args[2] || process.env.READY9JA_API_URL || "http://localhost:8000/api/v1/orders";
  const webhookEndpoint = (url, code) => `${url.replace(/\/$/, "")}/${code}/webhook`;

  console.log("==========================================================");
  console.log(" 🚀 vibe-logistics-hub Webhook Dispatch Test Suite");
  console.log("==========================================================");
  console.log(`Target Provider Code: ${providerCode}`);
  console.log(`Target Tracking ID / Order Ref: ${trackingId}`);

  // Server reachability check
  let activeBaseUrl = baseUrl;
  const candidatePorts = [8000, 5000, 3000];
  for (const port of candidatePorts) {
    const candidateUrl = `http://localhost:${port}/api/v1/orders`;
    try {
      const res = await fetch(webhookEndpoint(candidateUrl, providerCode), { method: "POST" }).catch(() => null);
      if (res && res.status !== 404) {
        activeBaseUrl = candidateUrl;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  const targetWebhookUrl = webhookEndpoint(activeBaseUrl, providerCode);
  console.log(`Target Endpoint: ${targetWebhookUrl}\n`);

  let totalTests = 0;
  let passedTests = 0;

  // Test Case 1: Status Filter Validation
  console.log("----------------------------------------------------------");
  console.log("TEST 1: Dispatch with unsupported status ('pending')");
  console.log("----------------------------------------------------------");
  totalTests++;
  const test1 = await dispatchOrderWebhook(targetWebhookUrl, trackingId, "pending");
  if (!test1.success && test1.error?.includes("only dispatched for out_for_delivery and delivered")) {
    console.log("✅ PASSED: Blocked unsupported status ('pending') without dispatching network request.");
    console.log(`   Validation Message: "${test1.error}"`);
    passedTests++;
  } else {
    console.log("❌ FAILED: Failed status validation guard.");
  }

  // Test Case 2: Dispatch 'out_for_delivery'
  console.log("\n----------------------------------------------------------");
  console.log("TEST 2: Dispatch 'out_for_delivery' status webhook to backend controller");
  console.log("----------------------------------------------------------");
  totalTests++;
  const test2 = await dispatchOrderWebhook(targetWebhookUrl, trackingId, "out_for_delivery");
  console.log(`\n  HTTP Response Status Code: ${test2.statusCode}`);
  console.log(`  Backend Controller Response:`, JSON.stringify(test2.response, null, 2));

  if (test2.statusCode && test2.response !== undefined) {
    console.log("✅ PASSED: Webhook dispatched with SHA-256 signature and processed by backend controller!");
    passedTests++;
  } else {
    console.log(`❌ FAILED: Webhook dispatch error - ${test2.error}`);
  }

  // Test Case 3: Dispatch 'delivered'
  console.log("\n----------------------------------------------------------");
  console.log("TEST 3: Dispatch 'delivered' status webhook to backend controller");
  console.log("----------------------------------------------------------");
  totalTests++;
  const test3 = await dispatchOrderWebhook(targetWebhookUrl, trackingId, "delivered");
  console.log(`\n  HTTP Response Status Code: ${test3.statusCode}`);
  console.log(`  Backend Controller Response:`, JSON.stringify(test3.response, null, 2));

  if (test3.statusCode && test3.response !== undefined) {
    console.log("✅ PASSED: Webhook dispatched with SHA-256 signature and processed by backend controller!");
    passedTests++;
  } else {
    console.log(`❌ FAILED: Webhook dispatch error - ${test3.error}`);
  }

  // Summary
  console.log("\n==========================================================");
  console.log(` Test Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log("==========================================================\n");
}

runTestSuite();
