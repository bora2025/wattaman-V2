# Changelog

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
