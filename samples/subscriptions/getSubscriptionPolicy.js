// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * This application demonstrates how to perform basic operations on
 * subscriptions with the Google Cloud Pub/Sub API.
 *
 * For more information, see the README.md under /pubsub and the documentation
 * at https://cloud.google.com/pubsub/docs.
 */

'use strict';

// Gets the IAM policy for a subscription.
function main(subscriptionName = 'YOUR_SUBSCRIPTION_NAME') {
  // [START pubsub_get_subscription_policy]
  /**
   * TODO(developer): Uncomment this variable before running the sample.
   */
  // const subscriptionName = 'YOUR_SUBSCRIPTION_NAME';

  // Imports the Google Cloud client library
  const {PubSub} = require('@google-cloud/pubsub');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  async function getSubscriptionPolicy() {
    // Retrieves the IAM policy for the subscription
    const [policy] = await pubSubClient
      .subscription(subscriptionName)
      .iam.getPolicy();

    console.log(`Policy for subscription: ${JSON.stringify(policy.bindings)}.`);
  }

  getSubscriptionPolicy();
  // [END pubsub_get_subscription_policy]
}

const {sampleMain} = require('../common');
sampleMain()
  .commandName('get-policy')
  .args('<subscriptionName>')
  .help('Gets the IAM policy for a subscription.')
  .example('worker-1')
  .execute(module, opts => main(opts.subscriptionName));
