// Copyright 2019-2021 Google LLC
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

// sample-metadata:
//   title: Listen For Protobuf Messages
//   description: Listens for messages in protobuf encoding from a subscription.
//   usage: node listenForProtobufMessages.js <proto-filename> <subscription-name> [timeout-in-seconds]

function main(subscriptionName = 'YOUR_SUBSCRIPTION_NAME', timeout = 60) {
  timeout = Number(timeout);

  // [START pubsub_subscribe_proto_messages]
  /**
   * TODO(developer): Uncomment these variables before running the sample.
   */
  // const subscriptionName = 'YOUR_SUBSCRIPTION_NAME';
  // const timeout = 60;

  // Imports the Google Cloud client library
  const {PubSub, Schema, Encodings} = require('@google-cloud/pubsub');

  // And the protobufjs library
  const protobuf = require('protobufjs');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  function listenForProtobufMessages() {
    // References an existing subscription
    const subscription = pubSubClient.subscription(subscriptionName);

    // Make an decoder using the protobufjs library.
    //
    // Since we're providing the test message for a specific schema here, we'll
    // also code in the path to a sample proto definition.
    const root = protobuf.loadSync('system-test/fixtures/provinces.proto');
    const Province = root.lookupType('utilities.Province');

    // Create an event handler to handle messages
    let messageCount = 0;
    const messageHandler = async message => {
      // "Ack" (acknowledge receipt of) the message
      message.ack();

      // Get the schema metadata from the message.
      const schemaMetadata = Schema.metadataFromMessage(message.attributes);

      let result;
      switch (schemaMetadata.encoding) {
        case Encodings.Binary:
          result = Province.decode(message.data);
          break;
        case Encodings.Json:
          result = JSON.parse(message.data.toString());
          // What's coming in here is not properly protobuf data, but you could
          // verify it if you like:
          // assert.strictEqual(null, Province.verify(result));
          break;
      }

      console.log(`Received message ${message.id}:`);
      console.log(`\tData: ${JSON.stringify(result, null, 4)}`);
      console.log(
        `\tAttributes: ${JSON.stringify(message.attributes, null, 4)}`
      );
      messageCount += 1;
    };

    // Listen for new messages until timeout is hit
    subscription.on('message', messageHandler);

    setTimeout(() => {
      subscription.removeListener('message', messageHandler);
      console.log(`${messageCount} message(s) received.`);
    }, timeout * 1000);
  }

  listenForProtobufMessages();
  // [END pubsub_subscribe_proto_messages]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));