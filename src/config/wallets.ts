import 'dotenv/config';
import { Converter } from '../utils/unit_converts';

const main = {
    "XNO": {
        mainAccountHot: "nano_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/XNO",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=XNO&api=" + process.env.NODES_API_KEY],
        converter: new Converter('XNO'),
        name: "Nano",
        decimalsToShow: 5,
        prefix: "nano",
        logo: "https://nanswap.com/logo/XNO.svg",
        explorer: "https://nanolooker.com/block/",
    },
    "XRO": {
        mainAccountHot: "xro_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/XRO",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=XRO&api=" + process.env.NODES_API_KEY],
        converter: new Converter('XRO'),
        name: "RaiBlocksOne",
        decimalsToShow: 5,
        prefix: "xro",
        logo: "https://nanswap.com/logo/XNO.svg",
        explorer: "https://nanolooker.com/block/",
    },
    "BAN": {
        mainAccountHot: "ban_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/BAN",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=BAN&api=" + process.env.NODES_API_KEY],
        converter: new Converter('BAN'),
        name: "Banano",
        decimalsToShow: 2,
        prefix: "ban",
        logo: "https://nanswap.com/logo/BAN.svg",
        explorer: "https://bananolooker.com/block/",
    },
    "XDG": {
        mainAccountHot: "xdg_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/XDG",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=XDG&api=" + process.env.NODES_API_KEY],
        converter: new Converter('XDG'),
        name: "DogeNano",
        decimalsToShow: 3,
        prefix: "xdg",
        logo: "https://nanswap.com/logo/XDG.png",
        explorer: "https://explorer.dogenano.io/block/",
    },
    "ANA": {
        mainAccountHot: "ana_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/ANA",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=ANA&api=" + process.env.NODES_API_KEY],
        converter: new Converter('ANA'),
        name: "Ananos",
        decimalsToShow: 0,
        prefix: "ana",
        logo: "https://nanswap.com/logo/ANA.png",
        explorer: "https://ananault.lightcord.org/transaction/",
    },
    "NANUSD": {
        mainAccountHot: "usd_1fhnfaone4wxc8ix94et63h9kr3cya7i786kjg34bttd48ce8y1gu18cwhoy",
        RPC: "https://nodes.nanswap.com/NANUSD",
        WS: ["wss://nodes.nanswap.com/ws/?ticker=NANUSD&api=" + process.env.NODES_API_KEY],
        converter: new Converter('NANUSD'),
        name: "nanUSD",
        decimalsToShow: 2,
        prefix: "usd",
        logo: "https://nanswap.com/logo/NANUSD.svg",
        explorer: "https://nanolooker.com/block/",
    }
}

export default main;