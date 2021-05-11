// Copyright 2019-2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * This sample demonstrates how to perform basic operations on topics with
 * the Google Cloud Pub/Sub API.
 *
 * For more information, see the README.md under /pubsub and the documentation
 * at https://cloud.google.com/pubsub/docs.
 */

'use strict';

// sample-metadata:
//   title: Publish Protobuf Messages to a Topic
//   description: Publishes a message in protobuf form to a topic with a schema.
//   usage: node publishProtobufMessages.js <topic-name>

function main(topicName = 'YOUR_TOPIC_NAME') {
  // [START pubsub_publish_proto_messages]
  /**
   * TODO(developer): Uncomment this variable before running the sample.
   */
  // const topicName = 'YOUR_TOPIC_NAME';

  // Imports the Google Cloud client library
  const {PubSub, Encodings} = require('@google-cloud/pubsub');

  // And the protobufjs library
  const protobuf = require('protobufjs');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  async function publishProtobufMessages() {
    // Get the topic metadata to learn about its schema.
    const topic = pubSubClient.topic(topicName);
    const [topicMetadata] = await topic.getMetadata();
    const topicSchemaMetadata = topicMetadata.schemaSettings;
    const schemaEncoding = topicSchemaMetadata.encoding;

    // Encode the message.
    const province = {
      name: 'Ontario',
      postAbbr: 'ON',
    };

    // Make an encoder using the protobufjs library.
    //
    // Since we're providing the test message for a specific schema here, we'll
    // also code in the path to a sample proto definition.
    const root = await protobuf.load('system-test/fixtures/provinces.proto');
    const Province = root.lookupType('utilities.Province');
    const message = Province.create(province);

    let dataBuffer;
    switch (schemaEncoding) {
      case Encodings.Binary:
        dataBuffer = Province.encode(message).finish();
        break;
      case Encodings.Json:
        dataBuffer = Buffer.from(JSON.stringify(message.toJSON()));
        break;
    }

    const messageId = await topic.publish(dataBuffer);
    console.log(`Protobuf message ${messageId} published.`);
  }

  publishProtobufMessages().catch(console.error);
  // [END pubsub_publish_proto_messages]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));