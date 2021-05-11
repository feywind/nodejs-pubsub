// Copyright 2021 Google LLC
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
 * schemas with the Google Cloud Pub/Sub API.
 *
 * For more information, see the README.md under /pubsub and the documentation
 * at https://cloud.google.com/pubsub/docs.
 */

'use strict';

// sample-metadata:
//   title: Create a Proto based Schema
//   description: Creates a new schema definition on a project, using Protos
//   usage: node createProtoSchema.js <schema-name> <proto-filename>

function main(
  schemaName = 'YOUR_SCHEMA_NAME',
  protoFile = 'path/to/a/proto/schema/file/(.proto)/formatted/in/protcol/buffers'
) {
  // [START pubsub_create_proto_schema]
  /**
   * TODO(developer): Uncomment these variables before running the sample.
   */
  // const schemaName = 'YOUR_SCHEMA_NAME';
  // const protoFile = 'path/to/a/proto/schema/file/(.proto)/formatted/in/protcol/buffers';

  // Imports the Google Cloud client library
  const {PubSub, SchemaTypes} = require('@google-cloud/pubsub');

  const fs = require('fs');

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  async function createProtoSchema() {
    const definition = fs.readFileSync(protoFile).toString();
    const schema = await pubSubClient.createSchema(
      schemaName,
      SchemaTypes.ProtocolBuffer,
      definition
    );
    const fullName = await schema.getName();
    console.log(`Schema ${fullName} created.`);
  }

  createProtoSchema();
  // [END pubsub_create_proto_schema]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));