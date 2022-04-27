"use strict";

require('dotenv').config()
const axios = require('axios').default;
const PQueue = require('p-queue');

const getName = require('./utils/getItameName')
const OauthClient = require('./OAuthClient');
const CONFIG = require('./config');
const notify = require('./Nexmo');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 8000;
app.get('/', (req: any, res: { send: (arg0: string) => any; }) => res.send('gearhunter'));
app.listen(PORT, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${PORT}`);
});


const oauthOptions = {
    client: {
        id: process.env.CLIENT_ID,
        secret: process.env.CLIENT_SECRET
    },
    auth: {
        tokenHost: process.env.OAUTH_TOKEN_HOST || "https://us.battle.net"
    }
};


class Spotitem {
    private accessToken: string;
    private oauthClient: any;
    private listOfConnectedRealmsIds: Array<any> = [];
    private listOfPromiseOfAuctionsUrls: Array<Promise<any>> = [];
    private queue: any;

    constructor(oauthClient: any, queue: any) {
        this.oauthClient = oauthClient;
        this.queue = queue
        this.accessToken = '';
    }

    async init() {
        this.accessToken = await this.oauthClient.getToken().catch((e: any) => {
            console.log(e);
        });
    }

    async getConnectedRealms() {
        console.log("---Récupération de la liste des serveurs connectés");
        await this.init();
        const connectedRealms = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/search/connected-realm?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e: any) => {
            console.log(e);
        });
        this._reduceConnectedRealms(connectedRealms.data.results);
    }

    _reduceConnectedRealms(connectedRealms: Array<any>) {
        this.listOfConnectedRealmsIds = [];
        for (let realm of connectedRealms) {
            console.log(realm.data.id);
            this.listOfConnectedRealmsIds.push(realm.data.id)
        }
    }

    async getAuctionsByRealmId(realmId: string) {
        console.log("---Téléchargement des auctions..---")
        const auction = {
            realmId,
            auctions: {
                horde: [],
                alliance: [],
                neutre: []
            }
        }
        const alliance = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/2?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e: any) => {
            console.log(e);
        });
        auction.auctions.alliance = alliance.data
        const horde = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/6?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e: any) => {
            console.log(e);
        });
        auction.auctions.horde = horde.data
        const neutre = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/7?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e: any) => {
            console.log(e);
        });
        auction.auctions.neutre = neutre.data
        await this.scanAuction(auction).catch((e: any) => {
            console.log(e);
        });
        return auction;
    }


    async scanAuction(auction: any) {
        const server = await this._getRealmPromise(auction.realmId);
        console.log(`---Scan de ${server.data.realms[0].name.fr_FR}...---`);
        try {
            const auctions = auction.auctions.horde.auctions || auction.auctions.alliance.auctions;
            const faction = auction.auctions.horde ? "horde" : auction.auctions.alliance ? "alliance" : null;

            if (auctions) {
                auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        if (bid.item.id === 15512) {
                            if (![588, 675, 929, 928, 1184, 589, 1099, 1185, 97, 96, 1653, 115, 114, 653, 93, 89, 111].includes(bid.item.rand)) {
                                console.log(getName(bid.item.id))
                                console.log(faction, bid.item)
                                console.log(faction, bid)
                                notify._notify(server, bid, faction);
                            } else {
                                console.log("pas la bonne variante");
                            }
                        } else {
                            if (this.isVariantSearched(bid.item.id, bid.item.rand)) {
                                console.log(getName(bid.item.id))
                                console.log(faction, bid.item)
                                console.log(faction, bid)
                                notify._notify(server, bid, faction);
                            } else {
                                console.log("pas la bonne variante");
                            }
                        }
                    }
                })
            }


        } catch (e) {
            console.log(e);
        }
        console.log("il reste ", this.queue._queue._queue.length, "serveurs à scanner...");
        console.log("---fin du scan---");
    }

    async _reduceQueueUrlsOfAuctionsOfConnectedRealms() {
        this.listOfPromiseOfAuctionsUrls = [];
        let index = 0;
        this.listOfConnectedRealmsIds.map(realmId => {
            //if (index >= 10) return;
            this.listOfPromiseOfAuctionsUrls.push(
                this.queue.add(async () => await this.getAuctionsByRealmId(realmId))
            );
            index++;
        });
    }

    async resolveAllAuctionsUrls() {
        console.log("---crawl de toutes les urls....---")
        return await Promise.allSettled(this.listOfPromiseOfAuctionsUrls).catch((e: any) => {
            console.log(e);
        });
    }

    async _getRealmPromise(realmId: number) {
        return await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e: any) => {
            console.log(e);
        });
    }

    isItemSearched(itemId: any): boolean {
        return CONFIG.listItems.all.some((item: any) => item.id === itemId);
    }

    isVariantSearched(itemId: number, variant: number) {
        const itemSearched = CONFIG.listItems.all.filter((item: any) => item.id === itemId);
        if (itemSearched[0].rand.length === 0) return true;
        return itemSearched[0].rand.includes(variant);
    }

    isPriceItemOk(bid: any): boolean {
        if (bid.buyout === 0) return false;
        const itemSearched = CONFIG.listItems.all.filter((itemSearch: any) => bid.item.id === itemSearch.id);
        return (bid.buyout / 10000) <= itemSearched[0].price


    }

    async run() {
        await this.getConnectedRealms();
        await this._reduceQueueUrlsOfAuctionsOfConnectedRealms();
        await this.resolveAllAuctionsUrls();
        console.log("----DONE, WAIT FOR RESTART NEW SCAN----")
        return "done";
    }
}

setImmediate(async () => {
    const oauthClient = new OauthClient({oauthOptions});
    const pqueue = new PQueue.default({concurrency: 1});
    let spot = new Spotitem(oauthClient, pqueue);
    await spot.run();
})

setInterval(async () => {
    const oauthClient = new OauthClient({oauthOptions});
    const pqueue = new PQueue.default({concurrency: 1});
    let spot = new Spotitem(oauthClient, pqueue);
    await spot.run();
}, 180000)



