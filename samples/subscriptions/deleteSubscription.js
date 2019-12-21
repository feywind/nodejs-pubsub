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

function main(subscriptionName = 'YOUR_SUBSCRIPTION_NAME') {
  // [START pubsub_delete_subscription]
  /**
   * TODO(developer): Uncomment this variable before running the sample.
   */
  // const subscriptionName = 'YOUR_SUBSCRIPTION_NAME';

  // Imports the Google Cloud client library
  const {PubSub} = require('@google-cloud/pubsub');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  async function deleteSubscription() {
    // Deletes the subscription
    await pubSubClient.subscription(subscriptionName).delete();
    console.log(`Subscription ${subscriptionName} deleted.`);
  }

  deleteSubscription();
  // [END pubsub_delete_subscription]
}

module.exports = {
  deleteSubscription: main,
};

if (module === require.main) {
  main(...process.argv.slice(2));
}
