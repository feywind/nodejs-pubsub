// Copyright 2019-2020 Google LLC
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

import {PubSub} from '@google-cloud/pubsub';
import {assert} from 'chai';
import {describe, it, before, after} from 'mocha';
import {execSync, commandFor} from './common';
import * as uuid from 'uuid';

// We are actually running tests with a version that has this.
// eslint-disable-next-line node/no-unsupported-features/node-builtins
import {promises as fs} from 'fs';

describe('subscriptions', () => {
  const projectId = process.env.GCLOUD_PROJECT;
  const pubsub = new PubSub({projectId});
  const runId = uuid.v4();
  const topicNameOne = `topic1-${runId}`;
  const topicNameTwo = `topic2-${runId}`;
  const topicNameThree = `topic3-${runId}`;
  const subscriptionNameOne = `sub1-${runId}`;
  const subscriptionNameTwo = `sub2-${runId}`;
  const subscriptionNameFour = `sub4-${runId}`;
  const subscriptionNameFive = `sub5-${runId}`;
  const subscriptionNameSix = `sub6-${runId}`;
  const subscriptionNameSeven = `sub7-${runId}`;
  const subscriptionNameEight = `sub8-${runId}`;
  const subscriptionNameDetach = `testdetachsubsxyz-${runId}`;
  const fullTopicNameOne = `projects/${projectId}/topics/${topicNameOne}`;
  const fullSubscriptionNameOne = `projects/${projectId}/subscriptions/${subscriptionNameOne}`;
  const fullSubscriptionNameTwo = `projects/${projectId}/subscriptions/${subscriptionNameTwo}`;
  const fullSubscriptionNameFour = `projects/${projectId}/subscriptions/${subscriptionNameFour}`;

  before(async () => {
    return Promise.all([
      pubsub.createTopic(topicNameOne),
      pubsub.createTopic(topicNameTwo),
      pubsub.createTopic(topicNameThree),
    ]);
  });

  after(async () => {
    const [subscriptions] = await pubsub.getSubscriptions();
    const runSubs = subscriptions.filter(x => x.name.endsWith(runId));
    for (const sub of runSubs) {
      await sub.delete();
    }
    const [topics] = await pubsub.getTopics();
    const runTops = topics.filter(x => x.name.endsWith(runId));
    for (const t of runTops) {
      await t.delete();
    }
  });

  it('should create a subscription', async () => {
    const output = execSync(
      `${commandFor(
        'createSubscription'
      )} ${topicNameOne} ${subscriptionNameOne}`
    );
    assert.include(output, `Subscription ${subscriptionNameOne} created.`);
    const [subscriptions] = await pubsub.topic(topicNameOne).getSubscriptions();
    assert.strictEqual(subscriptions[0].name, fullSubscriptionNameOne);
  });

  it('should create a push subscription', async () => {
    const output = execSync(
      `${commandFor(
        'createPushSubscription'
      )} ${topicNameOne} ${subscriptionNameTwo}`
    );
    assert.include(output, `Subscription ${subscriptionNameTwo} created.`);
    const [subscriptions] = await pubsub.topic(topicNameOne).getSubscriptions();
    assert(subscriptions.some(s => s.name === fullSubscriptionNameTwo));
  });

  it('should modify the config of an existing push subscription', async () => {
    const output = execSync(
      `${commandFor('modifyPushConfig')} ${topicNameTwo} ${subscriptionNameTwo}`
    );
    assert.include(
      output,
      `Modified push config for subscription ${subscriptionNameTwo}.`
    );
  });

  it('should get metadata for a subscription', async () => {
    const output = execSync(
      `${commandFor('getSubscription')} ${subscriptionNameOne}`
    );
    const expected =
      `Subscription: ${fullSubscriptionNameOne}` +
      `\nTopic: ${fullTopicNameOne}` +
      '\nPush config: ' +
      '\nAck deadline: 10s';
    assert.include(output, expected);
  });

  it('should list all subscriptions', async () => {
    const output = execSync(`${commandFor('listSubscriptions')}`);
    assert.match(output, /Subscriptions:/);
    assert.match(output, new RegExp(fullSubscriptionNameOne));
    assert.match(output, new RegExp(fullSubscriptionNameTwo));
  });

  it('should list subscriptions for a topic', async () => {
    const output = execSync(
      `${commandFor('listTopicSubscriptions')} ${topicNameOne}`
    );
    assert.match(output, new RegExp(`Subscriptions for ${topicNameOne}:`));
    assert.match(output, new RegExp(fullSubscriptionNameOne));
    assert.match(output, new RegExp(fullSubscriptionNameTwo));
  });

  it('should listen for messages', async () => {
    const messageIds = await pubsub
      .topic(topicNameOne)
      .publish(Buffer.from('Hello, world!'));
    const output = execSync(
      `${commandFor('listenForMessages')} ${subscriptionNameOne} 10`
    );
    assert.match(output, new RegExp(`Received message ${messageIds}:`));
  });

  it('should listen for large messages', async () => {
    const contents = 'Hello, world!';
    const messageIds = await pubsub
      .topic(topicNameOne)
      .publish(Buffer.from(contents));
    const output = execSync(
      `${commandFor(
        'listenForLargeMessages'
      )} ${subscriptionNameOne} message_ 10`
    );
    assert.match(output, new RegExp(`Received message ${messageIds}`));
    const contentsReceived = await fs.readFile('message_0.msg');
    assert.strictEqual(contentsReceived.toString(), contents);
    await fs.rm('message_0.msg');
  });

  it('should listen for messages with custom attributes', async () => {
    const messageIds = await pubsub
      .topic(topicNameOne)
      .publish(Buffer.from('Hello, world!'), {attr: 'value'});
    const output = execSync(
      `${commandFor('listenWithCustomAttributes')} ${subscriptionNameOne} 10`
    );
    assert.match(
      output,
      new RegExp(`Received message: id ${messageIds}.*attr.*value`)
    );
  });

  it('should listen for messages synchronously', async () => {
    await pubsub.topic(topicNameOne).publish(Buffer.from('Hello, world!'));
    const output = execSync(
      `${commandFor('synchronousPull')} ${projectId} ${subscriptionNameOne}`
    );
    assert.match(output, /Hello/);
    assert.match(output, /Done./);
  });

  it('should listen for messages synchronously with lease management', async () => {
    await pubsub.topic(topicNameOne).publish(Buffer.from('Hello, world!'));
    const output = execSync(
      `${commandFor(
        'synchronousPullWithLeaseManagement'
      )} ${projectId} ${subscriptionNameOne}`
    );
    assert.match(output, /Done./);
  });

  it('should listen to messages with flow control', async () => {
    const topicTwo = pubsub.topic(topicNameTwo);
    await topicTwo.subscription(subscriptionNameFour).get({autoCreate: true});
    await topicTwo.publish(Buffer.from('Hello, world!'));

    const output = execSync(
      `${commandFor(
        'subscribeWithFlowControlSettings'
      )} ${subscriptionNameFour} 5`
    );
    assert.include(
      output,
      'ready to receive messages at a controlled volume of 5 messages.'
    );
    const [subscriptions] = await pubsub.topic(topicNameTwo).getSubscriptions();
    assert(subscriptions.some(s => s.name === fullSubscriptionNameFour));
  });

  it('should listen for error messages', () => {
    assert.throws(
      () => execSync('node listenForErrors nonexistent-subscription'),
      /Resource not found/
    );
  });

  it('should set the IAM policy for a subscription', async () => {
    execSync(`${commandFor('setSubscriptionPolicy')} ${subscriptionNameOne}`);
    const results = await pubsub
      .subscription(subscriptionNameOne)
      .iam.getPolicy();
    const policy = results[0];
    assert.deepStrictEqual(policy.bindings, [
      {
        role: 'roles/pubsub.editor',
        members: ['group:cloud-logs@google.com'],
        condition: null,
      },
      {
        role: 'roles/pubsub.viewer',
        members: ['allUsers'],
        condition: null,
      },
    ]);
  });

  it('should get the IAM policy for a subscription', async () => {
    const results = await pubsub
      .subscription(subscriptionNameOne)
      .iam.getPolicy();
    const output = execSync(
      `${commandFor('getSubscriptionPolicy')} ${subscriptionNameOne}`
    );
    assert.include(
      output,
      `Policy for subscription: ${JSON.stringify(results[0].bindings)}.`
    );
  });

  it('should test permissions for a subscription', async () => {
    const output = execSync(
      `${commandFor('testSubscriptionPermissions')} ${subscriptionNameOne}`
    );
    assert.match(output, /Tested permissions for subscription/);
  });

  it('should delete a subscription', async () => {
    const output = execSync(
      `${commandFor('deleteSubscription')} ${subscriptionNameOne}`
    );
    assert.include(output, `Subscription ${subscriptionNameOne} deleted.`);
    const [subscriptions] = await pubsub.getSubscriptions();
    assert.ok(subscriptions);
    assert(subscriptions.every(s => s.name !== fullSubscriptionNameOne));
  });

  it('should detach a subscription', async () => {
    await pubsub.createSubscription(topicNameOne, subscriptionNameDetach);
    const output = execSync(
      `${commandFor('detachSubscription')} ${subscriptionNameDetach}`
    );
    assert.include(output, "'before' detached status: false");
    assert.include(output, "'after' detached status: true");
    const [subscriptionDetached] = await pubsub
      .subscription(subscriptionNameDetach)
      .detached();
    assert(subscriptionDetached === true);
  });

  it('should create a subscription with dead letter policy.', async () => {
    const output = execSync(
      `${commandFor(
        'createSubscriptionWithDeadLetterPolicy'
      )} ${topicNameTwo} ${subscriptionNameFive} ${topicNameThree}`
    );
    assert.include(
      output,
      `Created subscription ${subscriptionNameFive} with dead letter topic ${topicNameThree}.`
    );
    const [subscription] = await pubsub
      .topic(topicNameTwo)
      .subscription(subscriptionNameFive)
      .get();
    assert.strictEqual(
      subscription.metadata?.deadLetterPolicy?.maxDeliveryAttempts,
      10
    );
  });

  it('should listen for messages synchronously with delivery attempts.', async () => {
    await pubsub.topic(topicNameOne).createSubscription(subscriptionNameSix, {
      deadLetterPolicy: {
        deadLetterTopic: pubsub.topic(topicNameThree).name,
        maxDeliveryAttempts: 10,
      },
    });

    await pubsub.topic(topicNameOne).publish(Buffer.from('Hello, world!'));
    const output = execSync(
      `${commandFor(
        'synchronousPullWithDeliveryAttempts'
      )} ${projectId} ${subscriptionNameSix}`
    );
    assert.match(output, /Hello/);
    assert.match(output, /Delivery Attempt: 1/);
  });

  it('should update a subscription with dead letter policy.', async () => {
    const [presub] = await pubsub
      .topic(topicNameOne)
      .subscription(subscriptionNameSeven)
      .get({autoCreate: true});
    await presub.setMetadata({
      deadLetterPolicy: {
        deadLetterTopic: pubsub.topic(topicNameThree).name,
        maxDeliveryAttempts: 10,
      },
    });

    execSync(
      `${commandFor(
        'updateDeadLetterPolicy'
      )} ${topicNameOne} ${subscriptionNameSeven}`
    );

    const [subscription] = await pubsub
      .topic(topicNameOne)
      .subscription(subscriptionNameSeven)
      .get();
    assert.equal(
      subscription.metadata?.deadLetterPolicy?.maxDeliveryAttempts,
      15
    );
  });

  it('should remove dead letter policy.', async () => {
    const [presub] = await pubsub
      .topic(topicNameOne)
      .subscription(subscriptionNameSeven)
      .get({autoCreate: true});
    await presub.setMetadata({
      deadLetterPolicy: {
        deadLetterTopic: pubsub.topic(topicNameThree).name,
        maxDeliveryAttempts: 10,
      },
    });

    execSync(
      `${commandFor(
        'removeDeadLetterPolicy'
      )} ${topicNameOne} ${subscriptionNameSeven}`
    );

    const [subscription] = await pubsub
      .topic(topicNameOne)
      .subscription(subscriptionNameSeven)
      .get();
    assert.isNull(subscription.metadata?.deadLetterPolicy);
  });

  it('should create a subscription with ordering enabled.', async () => {
    const output = execSync(
      `${commandFor(
        'createSubscriptionWithOrdering'
      )} ${topicNameTwo} ${subscriptionNameEight} ${topicNameThree}`
    );
    assert.include(
      output,
      `Created subscription ${subscriptionNameEight} with ordering enabled.`
    );
    const [subscription] = await pubsub
      .topic(topicNameTwo)
      .subscription(subscriptionNameEight)
      .get();
    assert.strictEqual(subscription.metadata?.enableMessageOrdering, true);
  });
});
