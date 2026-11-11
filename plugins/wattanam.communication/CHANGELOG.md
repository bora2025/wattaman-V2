# Changelog

## 0.2.3

- Fix activation in schools: the delivery outbox job ran every 30 seconds, below the school's 60-second minimum, so activation failed with "Plugin job interval must be 60..31536000 seconds". It now runs every 60 seconds; messages are still delivered within about a minute.

## 0.2.2

- Add covering indexes for 1 foreign key (migrations 004-004) so lookups, cascades and parent deletes stay fast as school data grows. Additive only; no data changes.

## 0.2.1

- Declare the communication summary read model and the database transaction capability.

## 0.2.0

- Upgrade messages and communication posts to the universal SDK 1.3 declarative UI contract.

## 0.1.3

- Declare the operational contract and expose the standard runtime health probe.

## 0.1.2

- Publish student-keyed message activity counts for Parent Portal after send/read mutations.
- Exclude message bodies, participants and recipient lists from the projection.

## 0.1.1

- Persist message delivery events in the same transaction as the message.
- Retry pending realtime delivery with bounded exponential backoff and stable event IDs.

## 0.1.0

- Add namespaced direct messages with roster-based safeguarding.
- Add posts/news publishing storage and guarded management APIs.
- Add host-rendered inbox and post-management pages.
