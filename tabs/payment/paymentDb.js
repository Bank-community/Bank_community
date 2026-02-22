// tabs/payment/paymentDb.js
import { ref, update, push, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

export async function savePinToDb(db, membershipId, pin) {
    const updates = {};
    updates[`/members/${membershipId}/sipPin`] = pin;
    return update(ref(db), updates);
}

export async function executeP2PTransaction(db, sender, receiver, amount, note) {
    const updates = {};
    const timestamp = serverTimestamp();
    const dateStr = new Date().toISOString();

    // 1. Transaction IDs generate karna
    const senderTxId = push(ref(db, 'transactions')).key;
    const receiverTxId = push(ref(db, 'transactions')).key;
    const p2pId = push(ref(db, 'p2p_transfers')).key;

    // 2. Sender ki History (Paisa Gaya - Minus)
    updates[`/transactions/${senderTxId}`] = {
        transactionId: senderTxId,
        memberId: sender.membershipId,
        memberName: sender.fullName,
        date: dateStr,
        type: 'P2P Sent',
        amount: amount,
        p2pNote: note || '',
        receiverId: receiver.membershipId,
        receiverName: receiver.fullName,
        timestamp: timestamp
    };

    // 3. Receiver ki History (Paisa Aaya - Plus)
    updates[`/transactions/${receiverTxId}`] = {
        transactionId: receiverTxId,
        memberId: receiver.membershipId,
        memberName: receiver.fullName,
        date: dateStr,
        type: 'P2P Received',
        amount: amount,
        p2pNote: note || '',
        senderId: sender.membershipId,
        senderName: sender.fullName,
        timestamp: timestamp
    };

    // 4. Admin tracking ke liye special P2P Node
    updates[`/p2p_transfers/${p2pId}`] = {
        id: p2pId,
        senderId: sender.membershipId,
        senderName: sender.fullName,
        receiverId: receiver.membershipId,
        receiverName: receiver.fullName,
        amount: amount,
        note: note || '',
        date: dateStr,
        timestamp: timestamp
    };

    // 5. ATOMIC BALANCE UPDATE (Sabse zaroori hissa)
    updates[`/members/${sender.membershipId}/accountBalance`] = increment(-amount);
    updates[`/members/${receiver.membershipId}/accountBalance`] = increment(amount);

    // Ye line upar ka saara kaam exactly 1 second mein ek sath karegi
    return update(ref(db), updates);
}
