/*!
 * Copyright 2020-2023 Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Tracer,
  SpanContext,
  Span,
  context,
  trace,
  propagation,
  SpanKind,
  TextMapGetter,
  TextMapSetter,
  ROOT_CONTEXT,
  Context,
  Link,
} from '@opentelemetry/api';
import {Attributes, PubsubMessage} from './publisher/pubsub-message';
import {PublishOptions} from './publisher/index';
import {Duration} from './temporal';

export {Span};

// We need this to get the library version.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../package.json');

/**
 * Instantiates a Opentelemetry tracer for the library
 *
 * @private
 */
let cachedTracer: Tracer | undefined;
function getTracer(): Tracer {
  const tracer =
    cachedTracer ??
    trace.getTracer('@google-cloud/pubsub', packageJson.version);
  cachedTracer = tracer;
  return cachedTracer;
}

/**
 * Determination of the level of OTel support we're providing.
 *
 * @private
 */
export enum OpenTelemetryLevel {
  /**
   * None: OTel support is not enabled because we found no trace provider.
   */
  None = 0,

  /**
   * Legacy: We found a trace provider, but the user also specified the old
   * manual enable flag; this will trigger the legacy attribute being included.
   * The modern propagation attribute will _also_ be included.
   */
  Legacy = 1,

  /**
   * Modern: We will only inject/extract the modern propagation attribute.
   */
  Modern = 2,
}

/**
 * Tries to divine what sort of OpenTelemetry we're supporting. See the enum
 * for the meaning of the values, and other notes.
 *
 * Legacy OTel is no longer officially supported, but we don't want to
 * break anyone at a non-major.
 *
 * @private
 */
export function isEnabled(
  publishSettings?: PublishOptions
): OpenTelemetryLevel {
  // If there's no trace provider attached, do nothing in any case.
  const traceProvider = trace.getTracerProvider();
  if (!traceProvider) {
    return OpenTelemetryLevel.None;
  }

  if (publishSettings?.enableOpenTelemetryTracing) {
    return OpenTelemetryLevel.Legacy;
  }

  return OpenTelemetryLevel.Modern;
}

/**
 * Our Carrier object for propagation is anything with an 'attributes'
 * object, which is one of several possible Message classes. (They're
 * different for publish and subscribe.)
 *
 * Also we add a parentSpan optional member for passing around the
 * actual Span object within the client library. This can be a publish
 * or subscriber span, depending on the context.
 *
 * @private
 */
export interface MessageWithAttributes {
  attributes?: Attributes | null | undefined;
  parentSpan?: Span;
}

/**
 * Implements common members for the TextMap getter and setter interfaces for Pub/Sub messages.
 *
 * @private
 */
export class PubsubMessageGetSet {
  static keyPrefix = 'googclient_';

  keys(carrier: MessageWithAttributes): string[] {
    return Object.getOwnPropertyNames(carrier.attributes)
      .filter(n => n.startsWith(PubsubMessageGetSet.keyPrefix))
      .map(n => n.substring(PubsubMessageGetSet.keyPrefix.length));
  }

  protected attributeName(key: string): string {
    return `${PubsubMessageGetSet.keyPrefix}${key}`;
  }
}

/**
 * Implements the TextMap getter interface for Pub/Sub messages.
 *
 * @private
 */
export class PubsubMessageGet
  extends PubsubMessageGetSet
  implements TextMapGetter<MessageWithAttributes>
{
  get(
    carrier: MessageWithAttributes,
    key: string
  ): string | string[] | undefined {
    return carrier?.attributes?.[this.attributeName(key)];
  }
}

/**
 * Implements the TextMap setter interface for Pub/Sub messages.
 *
 * @private
 */
export class PubsubMessageSet
  extends PubsubMessageGetSet
  implements TextMapSetter<MessageWithAttributes>
{
  set(carrier: MessageWithAttributes, key: string, value: string): void {
    if (!carrier.attributes) {
      carrier.attributes = {};
    }
    carrier.attributes[this.attributeName(key)] = value;
  }
}

/**
 * The getter to use when calling extract() on a Pub/Sub message.
 *
 * @private
 */
export const pubsubGetter = new PubsubMessageGet();

/**
 * The setter to use when calling inject() on a Pub/Sub message.
 *
 * @private
 */
export const pubsubSetter = new PubsubMessageSet();

/**
 * Description of the data structure passed for span attributes.
 *
 * @private
 */
export interface SpanAttributes {
  [x: string]: string | number | boolean;
}

/**
 * Converts a SpanContext to a full Context, as needed.
 *
 * @private
 */
export function spanContextToContext(
  parent?: SpanContext
): Context | undefined {
  return parent ? trace.setSpanContext(context.active(), parent) : undefined;
}

/**
 * The modern propagation attribute name.
 *
 * Technically this is determined by the OpenTelemetry library, but
 * in practice, it follows the W3C spec, so this should be the right
 * one. The only thing we're using it for, anyway, is emptying user
 * supplied attributes.
 *
 * @private
 */
export const modernAttributeName = 'googclient_traceparent';

/**
 * The old legacy attribute name.
 *
 * @private
 */
export const legacyAttributeName = 'googclient_OpenTelemetrySpanContext';

export interface AttributeParams {
  // Fully qualified.
  topicName?: string;
  subName?: string;

  // These are generally split from the fully qualified names.
  projectId?: string;
  topicId?: string;
  subId?: string;
}

/**
 * Break down the subscription's full name into its project and ID.
 *
 * @private
 */
export function getSubscriptionInfo(fullName: string): AttributeParams {
  const results = fullName.match(/projects\/([^/]+)\/subscriptions\/(.+)/);
  if (!results?.[0]) {
    return {
      subName: fullName,
    };
  }

  return {
    subName: fullName,
    projectId: results[1],
    subId: results[2],
  };
}

/**
 * Break down the subscription's full name into its project and ID.
 *
 * @private
 */
export function getTopicInfo(fullName: string): AttributeParams {
  const results = fullName.match(/projects\/([^/]+)\/topics\/(.+)/);
  if (!results?.[0]) {
    return {
      topicName: fullName,
    };
  }

  return {
    topicName: fullName,
    projectId: results[1],
    topicId: results[2],
  };
}

export class PubsubSpans {
  static createAttributes(
    params: AttributeParams,
    message?: PubsubMessage
  ): SpanAttributes {
    const destinationName = params.topicName ?? params.subName;
    const destinationId = params.topicId ?? params.subId;
    const projectId = params.projectId;

    // Purposefully leaving this debug check here as a comment - this should
    // always be true, but we don't want to fail in prod if it's not.
    /*if (
      (params.topicName && params.subName) ||
      (!destinationName && !projectId && !destinationId)
    ) {
      throw new Error(
        'One of topicName or subName must be specified, and must be fully qualified'
      );
    }*/

    const spanAttributes = {
      // Add Opentelemetry semantic convention attributes to the span, based on:
      // https://github.com/open-telemetry/opentelemetry-specification/blob/v1.1.0/specification/trace/semantic_conventions/messaging.md
      ['messaging.system']: 'gcp_pubsub',
      ['messaging.destination.name']: destinationId ?? destinationName,
      ['gcp.project_id']: projectId,
    } as SpanAttributes;

    if (message) {
      if (message.calculatedSize) {
        spanAttributes['messaging.message.envelope.size'] =
          message.calculatedSize;
      } else {
        if (message.data?.length) {
          spanAttributes['messaging.message.envelope.size'] =
            message.data?.length;
        }
      }
      if (message.orderingKey) {
        spanAttributes['messaging.gcp_pubsub.message.ordering_key'] =
          message.orderingKey;
      }
      if (message.isExactlyOnceDelivery) {
        spanAttributes['messaging.gcp_pubsub.message.exactly_once_delivery'] =
          message.isExactlyOnceDelivery;
      }
      if (message.ackId) {
        spanAttributes['messaging.gcp_pubsub.message.ack_id'] = message.ackId;
      }
    }

    return spanAttributes;
  }

  static createPublisherSpan(message: PubsubMessage, topicName: string): Span {
    const topicInfo = getTopicInfo(topicName);
    const span: Span = getTracer().startSpan(`${topicName} create`, {
      kind: SpanKind.PRODUCER,
      attributes: PubsubSpans.createAttributes(topicInfo, message),
    });
    if (topicInfo.topicId) {
      span.updateName(`${topicInfo.topicId} create`);
      span.setAttribute('messaging.destination.name', topicInfo.topicId);
    }

    return span;
  }

  static updatePublisherTopicName(span: Span, topicName: string) {
    const topicInfo = getTopicInfo(topicName);
    if (topicInfo.topicId) {
      span.updateName(`${topicInfo.topicId} create`);
      span.setAttribute('messaging.destination.name', topicInfo.topicId);
    } else {
      span.updateName(`${topicName} create`);
    }
    if (topicInfo.projectId) {
      span.setAttribute('gcp.project_id', topicInfo.projectId);
    }
  }

  static createReceiveSpan(
    message: PubsubMessage,
    subName: string,
    parent: Context | undefined
  ): Span {
    const subInfo = getSubscriptionInfo(subName);
    const name = `${subInfo.subId ?? subName} subscribe`;
    const attributes = this.createAttributes(subInfo, message);
    if (subInfo.subId) {
      attributes['messaging.destination.name'] = subInfo.subId;
    }

    if (context) {
      return getTracer().startSpan(
        name,
        {
          kind: SpanKind.CONSUMER,
          attributes,
        },
        parent
      );
    } else {
      return getTracer().startSpan(name, {
        kind: SpanKind.CONSUMER,
        attributes,
      });
    }
  }

  static createChildSpan(
    name: string,
    message?: PubsubMessage,
    parentSpan?: Span,
    attributes?: SpanAttributes
  ): Span | undefined {
    const parent = message?.parentSpan ?? parentSpan;
    if (parent) {
      return getTracer().startSpan(
        name,
        {
          kind: SpanKind.INTERNAL,
          attributes: attributes ?? {},
        },
        spanContextToContext(parent.spanContext())
      );
    } else {
      return undefined;
    }
  }

  static createPublishFlowSpan(message: PubsubMessage): Span | undefined {
    return PubsubSpans.createChildSpan('publisher flow control', message);
  }

  static createPublishSchedulerSpan(message: PubsubMessage): Span | undefined {
    return PubsubSpans.createChildSpan('publisher batching', message);
  }

  static createPublishRpcSpan(
    messages: MessageWithAttributes[],
    topicName: string
  ): Span {
    const spanAttributes = PubsubSpans.createAttributes(
      getTopicInfo(topicName)
    );
    const links: Link[] = messages
      .map(m => ({context: m.parentSpan?.spanContext()}) as Link)
      .filter(l => l.context);
    const span: Span = getTracer().startSpan(
      `${topicName} send`,
      {
        kind: SpanKind.PRODUCER,
        attributes: spanAttributes,
        links,
      },
      ROOT_CONTEXT
    );
    span?.setAttribute('messaging.batch.message_count', messages.length);
    messages.forEach(m => {
      // Workaround until the JS API properly supports adding links later.
      if (m.parentSpan) {
        m.parentSpan.setAttribute(
          'messaging.gcp_pubsub.publish.trace_id',
          span.spanContext().traceId
        );
        m.parentSpan.setAttribute(
          'messaging.gcp_pubsub.publish.span_id',
          span.spanContext().spanId
        );
      }
    });

    return span;
  }

  static createReceiveResponseRpcSpan(
    messageSpans: (Span | undefined)[],
    subName: string
  ): Span {
    const spanAttributes = PubsubSpans.createAttributes(
      getSubscriptionInfo(subName)
    );
    const links: Link[] = messageSpans
      .map(m => ({context: m?.spanContext()}) as Link)
      .filter(l => l.context);
    const span: Span = getTracer().startSpan(
      `${subName} response batch`,
      {
        kind: SpanKind.CONSUMER,
        attributes: spanAttributes,
        links,
      },
      ROOT_CONTEXT
    );
    span?.setAttribute('messaging.batch.message_count', messageSpans.length);
    messageSpans.forEach(m => {
      // Workaround until the JS API properly supports adding links later.
      if (m) {
        m.setAttribute(
          'messaging.gcp_pubsub.receive.trace_id',
          span.spanContext().traceId
        );
        m.setAttribute(
          'messaging.gcp_pubsub.receive.span_id',
          span.spanContext().spanId
        );
      }
    });

    return span;
  }

  static createReceiveFlowSpan(
    message: MessageWithAttributes
  ): Span | undefined {
    return PubsubSpans.createChildSpan(
      'subscriber concurrency control',
      message
    );
  }

  static createReceiveSchedulerSpan(
    message: MessageWithAttributes
  ): Span | undefined {
    return PubsubSpans.createChildSpan('subscriber scheduler', message);
  }

  static createReceiveProcessSpan(
    message: MessageWithAttributes,
    subName: string
  ): Span | undefined {
    const subInfo = getSubscriptionInfo(subName);
    return PubsubSpans.createChildSpan(
      `${subInfo.subId ?? subName} process`,
      message
    );
  }

  static setReceiveProcessResult(span: Span, isAck: boolean) {
    span.setAttribute('messaging.gcp_pubsub.result', isAck ? 'ack' : 'nack');
  }

  static createReceiveLeaseSpan(
    message: MessageWithAttributes,
    subName: string,
    type: 'modack' | 'ack' | 'nack',
    deadline?: Duration,
    isInitial?: boolean
  ): Span | undefined {
    const subInfo = getSubscriptionInfo(subName);
    const span = PubsubSpans.createReceiveSpan(
      message,
      `${subInfo.subId ?? subInfo.subName} ${type}`,
      undefined
    );

    if (deadline) {
      span?.setAttribute(
        'messaging.gcp_pubsub.message.ack_deadline_seconds',
        deadline.totalOf('second')
      );
    }
    if (isInitial !== undefined) {
      span?.setAttribute('messaging.gcp_pubsub.is_receipt_modack', isInitial);
    }
    return span;
  }
}

/**
 * Creates and manipulates Pub/Sub-related events on spans.
 */
export class PubsubEvents {
  static addEvent(
    text: string,
    message: MessageWithAttributes,
    attributes?: Attributes
  ): void {
    const parent = message.parentSpan;
    if (!parent) {
      return;
    }

    parent.addEvent(text, attributes);
  }

  static publishStart(message: MessageWithAttributes) {
    PubsubEvents.addEvent('publish start', message);
  }

  static publishEnd(message: MessageWithAttributes) {
    PubsubEvents.addEvent('publish end', message);
  }

  static ackStart(message: MessageWithAttributes) {
    PubsubEvents.addEvent('ack start', message);
  }

  static ackEnd(message: MessageWithAttributes) {
    PubsubEvents.addEvent('ack end', message);
  }

  static modackStart(message: MessageWithAttributes) {
    PubsubEvents.addEvent('modack start', message);
  }

  static modackEnd(message: MessageWithAttributes) {
    PubsubEvents.addEvent('modack end', message);
  }

  static nackStart(message: MessageWithAttributes) {
    PubsubEvents.addEvent('nack start', message);
  }

  static nackEnd(message: MessageWithAttributes) {
    PubsubEvents.addEvent('nack end', message);
  }

  static ackCalled(span: Span) {
    span.addEvent('ack called');
  }

  static nackCalled(span: Span) {
    span.addEvent('nack called');
  }

  static modAckCalled(span: Span, deadline: Duration) {
    // User-called modAcks are never initial ones.
    span.addEvent('modack called', {
      'messaging.gcp_pubsub.modack_deadline_seconds': `${deadline.totalOf(
        'second'
      )}`,
      'messaging.gcp_pubsub.is_receipt_modack': 'false',
    });
  }

  static modAckStart(
    message: MessageWithAttributes,
    deadline: Duration,
    isInitial: boolean
  ) {
    PubsubEvents.addEvent('modack start', message, {
      'messaging.gcp_pubsub.modack_deadline_seconds': `${deadline.totalOf(
        'second'
      )}`,
      'messaging.gcp_pubsub.is_receipt_modack': isInitial ? 'true' : 'false',
    });
  }

  static modAckEnd(message: MessageWithAttributes) {
    PubsubEvents.addEvent('modack end', message);
  }

  // Add this event any time the process is shut down before processing
  // of the message can complete.
  static shutdown(message: MessageWithAttributes) {
    PubsubEvents.addEvent('shutdown', message);
  }
}

/**
 * Injects the trace context into a Pub/Sub message (or other object with
 * an 'attributes' object) for propagation.
 *
 * This is for the publish side.
 *
 * @private
 */
export function injectSpan(
  span: Span,
  message: MessageWithAttributes,
  enabled: OpenTelemetryLevel
): void {
  if (!message.attributes) {
    message.attributes = {};
  }

  if (message.attributes[modernAttributeName]) {
    console.warn(
      `${modernAttributeName} key set as message attribute, but will be overridden.`
    );

    delete message.attributes[modernAttributeName];
  }

  // If we're in legacy mode, add that header as well.
  if (enabled === OpenTelemetryLevel.Legacy) {
    if (message.attributes[legacyAttributeName]) {
      console.warn(
        `${legacyAttributeName} key set as message attribute, but will be overridden.`
      );
    }
    message.attributes[legacyAttributeName] = JSON.stringify(
      span.spanContext()
    );
  }

  // Always do propagation injection with the trace context.
  const context = trace.setSpanContext(ROOT_CONTEXT, span.spanContext());
  propagation.inject(context, message, pubsubSetter);

  // Also put the direct reference to the Span object for while we're
  // passing it around in the client library.
  message.parentSpan = span;
}

/**
 * Returns true if this message potentially contains a span context.
 *
 * @private
 */
export function containsSpanContext(message: MessageWithAttributes): boolean {
  if (message.parentSpan) {
    return true;
  }

  if (!message.attributes) {
    return false;
  }

  const keys = Object.getOwnPropertyNames(message.attributes);
  return !!keys.find(
    n => n === legacyAttributeName || n === modernAttributeName
  );
}

/**
 * Extracts the trace context from a Pub/Sub message (or other object with
 * an 'attributes' object) from a propagation, for receive processing. If no
 * context was present, create a new parent span.
 *
 * This is for the receive side.
 *
 * @private
 */
export function extractSpan(
  message: MessageWithAttributes,
  subName: string,
  enabled: OpenTelemetryLevel
): Span | undefined {
  if (message.parentSpan) {
    return message.parentSpan;
  }

  const keys = Object.getOwnPropertyNames(message.attributes ?? {});

  let context: Context | undefined;

  if (enabled === OpenTelemetryLevel.Legacy) {
    // Only prefer the legacy attributes to no trace context attribute.
    if (
      keys.includes(legacyAttributeName) &&
      !keys.includes(modernAttributeName)
    ) {
      const legacyValue = message.attributes?.[legacyAttributeName];
      if (legacyValue) {
        const parentSpanContext: SpanContext | undefined = legacyValue
          ? JSON.parse(legacyValue)
          : undefined;
        if (parentSpanContext) {
          context = spanContextToContext(parentSpanContext);
        }
      }
    }
  } else {
    if (keys.includes(modernAttributeName)) {
      context = propagation.extract(ROOT_CONTEXT, message, pubsubGetter);
    }
  }

  const span = PubsubSpans.createReceiveSpan(message, subName, context);
  message.parentSpan = span;
  return span;
}

// Since these were exported on the main Pub/Sub index in the previous
// version, we have to export them until the next major.
export const legacyExports = {
  /**
   * @deprecated
   * Use the new telemetry functionality instead; see the updated OpenTelemetry
   * sample for an example.
   */
  createSpan: function (
    spanName: string,
    kind: SpanKind,
    attributes?: SpanAttributes,
    parent?: SpanContext
  ): Span {
    return getTracer().startSpan(
      spanName,
      {
        kind,
        attributes,
      },
      parent ? trace.setSpanContext(context.active(), parent) : undefined
    );
  },
};