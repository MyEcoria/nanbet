import 'dotenv/config';
import crypto from 'crypto';

export async function create_account() {
    const body = {
        "action": "account_create",
        "wallet": process.env.NANSWAP_NODES_WALLET_ID!
    };

    let res = await fetch(process.env.NANSWAP_NODES_WALLET_RPC!, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getSignedHeaders(body)
        },
        body: JSON.stringify(body),
    });

    const resData = await res.json();

    return resData.account;
}

export async function sendFeeless(ticker: string, fromAccount: string, toAccount: string, rawAmount: string): Promise<string | undefined> {
    console.log({level: 'info', message: `Try to send ${ticker} to ${toAccount}`, raw: rawAmount});

    const body = {
        "action": "send",
        "wallet": process.env.NANSWAP_NODES_WALLET_ID!,
        "source": fromAccount,
        "destination": toAccount,
        "amount": rawAmount,
        "ticker": ticker
    };

    console.log({level: 'info', message: `Sending ${ticker}`, body: body});

    let res = await fetch(process.env.NANSWAP_NODES_WALLET_RPC!, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getSignedHeaders(body)
        },
        body: JSON.stringify(body),
    });

    const resData = await res.json();
    console.log({level: 'info', message: `${ticker} sent`, res: resData});

    return resData.block;
}

function getSignedHeaders(message) {
    const messageToSign = {
        "ticker": "ALL",
        "params": message,
        "ts": Date.now().toString()
    };

    const signature = crypto.createHmac('sha256', process.env.NANSWAP_NODES_WALLET_SECRET_KEY!)
        .update(JSON.stringify(messageToSign))
        .digest('hex');

    const headers = {
        'nodes-api-key': process.env.NANSWAP_NODES_WALLET_API_KEY!,
        'signature': signature,
        'ts': messageToSign.ts,
    };

    return headers;
}
