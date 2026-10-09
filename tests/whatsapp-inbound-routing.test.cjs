"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { routeWhatsAppEvent, resolveDeliveryStatus } = require("../lib/whatsapp-inbound-routing.cjs");
const base = {
  "expectedPhoneNumberId": "sandbox_phone",
  "phoneNumberId": "sandbox_phone",
  "field": "messages",
  "kind": "message",
  "messageId": "wamid.sandbox.01",
  "contactId": "test-contact",
  "requests": [
    {
      "id": "request-1",
      "isCommercial": true,
      "isPrivate": false
    }
  ]
};
const cases = [
  {
    "name": "business inbound linked",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "attach"
  },
  {
    "name": "different business phone",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "personal_number",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "missing expected phone",
    "event": {
      "expectedPhoneNumberId": "",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "personal app echo",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "smb_message_echoes",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "app sync event",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "smb_app_state_sync",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "history event",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "history",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "duplicate",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ],
      "duplicate": true
    },
    "expected": "ignore"
  },
  {
    "name": "private contact",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ],
      "contactPrivate": true
    },
    "expected": "ignore"
  },
  {
    "name": "unknown sender",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": null,
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "no matching request",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": []
    },
    "expected": "ignore"
  },
  {
    "name": "false personal request",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "r2",
          "isCommercial": false,
          "isPrivate": false
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "private archived request",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "r3",
          "isCommercial": true,
          "isPrivate": true
        }
      ]
    },
    "expected": "ignore"
  },
  {
    "name": "ambiguous cases",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        },
        {
          "id": "r4",
          "isCommercial": true
        }
      ]
    },
    "expected": "manual_review"
  },
  {
    "name": "verified specific reply",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        },
        {
          "id": "r4",
          "isCommercial": true
        }
      ],
      "contextRequestId": "r4"
    },
    "expected": "attach"
  },
  {
    "name": "wrong reply context",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ],
      "contextRequestId": "r999"
    },
    "expected": "ignore"
  },
  {
    "name": "delivery status",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "status",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ],
      "status": "delivered",
      "whatsappMessageId": "wamid.mock.status"
    },
    "expected": "update_delivery"
  },
  {
    "name": "unlinked delivery status",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "status",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": [
        {
          "id": "request-1",
          "isCommercial": true,
          "isPrivate": false
        }
      ],
      "status": "read",
      "whatsappMessageId": null
    },
    "expected": "ignore"
  },
  {
    "name": "outbound no request",
    "event": {
      "expectedPhoneNumberId": "sandbox_phone",
      "phoneNumberId": "sandbox_phone",
      "field": "messages",
      "kind": "message",
      "messageId": "wamid.sandbox.01",
      "contactId": "test-contact",
      "requests": []
    },
    "expected": "ignore"
  }
];
for (const sample of cases) test(sample.name, () => {
  assert.equal(routeWhatsAppEvent(sample.event).action, sample.expected);
});
const statusCases = [
  [
    "sent",
    "delivered",
    "delivered"
  ],
  [
    "read",
    "sent",
    "read"
  ],
  [
    "delivered",
    "read",
    "read"
  ],
  [
    "sent",
    "failed",
    "failed"
  ],
  [
    "failed",
    "delivered",
    "failed"
  ]
];
for(const [oldState,newState,expected] of statusCases)test("delivery "+oldState+" to "+newState,() => {
  assert.equal(resolveDeliveryStatus(oldState,newState),expected);
});
