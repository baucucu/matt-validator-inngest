import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://api.leadmagic.io';

export default async function leadmagic(path: string, data: any) {
    if (!process.env.LEADMAGIC_API_KEY) {
        throw new Error('LEADMAGIC_API_KEY is not defined in environment variables');
    }

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'X-API-Key': process.env.LEADMAGIC_API_KEY
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
}
