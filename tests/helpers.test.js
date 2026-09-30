const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeMessage } = require('../utils/helpers');

test('serializeMessage should not crash when receipt arrays are missing', () => {
  const msg = {
    _id: 'm1',
    chat: 'c1',
    sender: 'u1',
    text: 'hello',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    deliveredTo: [],
  };

  assert.deepEqual(serializeMessage(msg, 2), {
    _id: 'm1',
    chat: 'c1',
    sender: 'u1',
    text: 'hello',
    createdAt: msg.createdAt,
    status: 'sent',
  });
});
