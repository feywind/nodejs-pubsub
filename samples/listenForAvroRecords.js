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
//   title: Listen For Avro Records
//   description: Listens for messages in Avro encoding from a subscription.
//   usage: node listenForAvroRecords.js <subscription-name> [timeout-in-seconds]

function main(subscriptionName = 'YOUR_SUBSCRIPTION_NAME', timeout = 60) {
  timeout = Number(timeout);

  // [START pubsub_subscribe_avro_records]
  /**
   * TODO(developer): Uncomment these variables before running the sample.
   */
  // const subscriptionName = 'YOUR_SUBSCRIPTION_NAME';
  // const timeout = 60;

  // Imports the Google Cloud client library
  const {PubSub, Schema, Encoding} = require('@google-cloud/pubsub');

  // And the Apache Avro library
  const avro = require('avro-js');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  function listenForAvroRecords() {
    // References an existing subscription
    const subscription = pubSubClient.subscription(subscriptionName);

    // Create an event handler to handle messages
    let messageCount = 0;
    const types = new Map();
    const messageHandler = async message => {
      // "Ack" (acknowledge receipt of) the message
      message.ack();

      // Get the schema metadata from the message.
      const schemaMetadata = Schema.metadataFromMessage(message.attributes);

      let type = types.get(schemaMetadata.name);
      if (!type) {
        // Get the schema definition to decode the Avro.
        //
        // Note that you might not have permissions to the schema, as a subscriber,
        // in which case you will need to get this information out of band.
        const schema = pubSubClient.schema(schemaMetadata.name);
        const schemaDef = await schema.get();
        type = avro.parse(schemaDef.definition);
        types.set(schemaMetadata.name, type);
      }

      let result;
      switch (schemaMetadata.encoding) {
        case Encoding.Binary:
          result = type.fromBuffer(message.data);
          break;
        case Encoding.Json:
          result = type.fromString(message.data.toString());
          break;
      }

      console.log(`Received message ${message.id}:`);
      console.log(`\tData: ${JSON.stringify(result, null, 4)}`);
      console.log(`\tAttributes: ${message.attributes}`);
      messageCount += 1;
    };

    // Listen for new messages until timeout is hit
    subscription.on('message', messageHandler);

    setTimeout(() => {
      subscription.removeListener('message', messageHandler);
      console.log(`${messageCount} message(s) received.`);
    }, timeout * 1000);
  }

  listenForAvroRecords();
  // [END pubsub_subscribe_avro_records]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));
