"use strict";
require('dotenv').config();
const axios = require('axios').default;
const PQueue = require('p-queue');
const getName = require('./enums/itemsEnum');
const OauthClient = require('./OAuthClient');
const CONFIG = require('./config');
const notify = require('./Nexmo');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => res.send('gearhunter'));
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
const oauthClient = new OauthClient({ oauthOptions });
const pqueue = new PQueue.default({ concurrency: 1 });
class Spotitem {
    constructor(oauthClient) {
        this.listOfConnectedRealmsIds = [];
        this.listOfPromiseOfAuctionsUrls = [];
        this.oauthClient = oauthClient;
        this.accessToken = '';
    }
    async init() {
        this.accessToken = await this.oauthClient.getToken().catch((e) => {
            console.log(e);
        });
    }
    async getConnectedRealms() {
        console.log("---Récupération de la liste des serveurs connectés");
        await this.init();
        const connectedRealms = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/search/connected-realm?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log(e);
        });
        this._reduceConnectedRealms(connectedRealms.data.results);
    }
    _reduceConnectedRealms(connectedRealms) {
        this.listOfConnectedRealmsIds = [];
        for (let realm of connectedRealms) {
            console.log(realm.data.id);
            this.listOfConnectedRealmsIds.push(realm.data.id);
        }
    }
    async getAuctionsByRealmId(realmId) {
        console.log("---Téléchargement des auctions..---");
        const auction = {
            realmId,
            auctions: {
                horde: [],
                alliance: [],
                neutre: []
            }
        };
        const alliance = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/2?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log(e);
        });
        auction.auctions.alliance = alliance.data;
        const horde = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/6?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log(e);
        });
        auction.auctions.horde = horde.data;
        const neutre = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/7?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log(e);
        });
        auction.auctions.neutre = neutre.data;
        await this.scanAuction(auction).catch((e) => {
            console.log(e);
        });
        return auction;
    }
    async scanAuction(auction) {
        const server = await this._getRealmPromise(auction.realmId);
        console.log(`---Scan de ${server.data.realms[0].name.fr_FR}...---`);
        try {
            if (auction.auctions?.horde) {
                await auction.auctions?.horde?.auctions.map((bid) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        console.log(getName(bid.item.id));
                        notify._notify(server, bid, "horde");
                    }
                });
            }
            if (auction.auctions?.alliance) {
                await auction.auctions?.alliance?.auctions.map((bid) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        console.log(getName(bid.item.id));
                        notify._notify(server, bid, "alliance");
                    }
                });
            }
            if (auction.auctions?.neutre) {
                await auction.auctions?.neutre?.auctions.map((bid) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        console.log(getName(bid.item.id));
                        notify._notify(server, bid, "neutre");
                    }
                });
            }
        }
        catch (e) {
            console.log(e);
        }
        console.log(pqueue._queue._queue.length);
        console.log("---fin du scan---");
    }
    async _reduceQueueUrlsOfAuctionsOfConnectedRealms() {
        this.listOfPromiseOfAuctionsUrls = [];
        let index = 0;
        this.listOfConnectedRealmsIds.map(realmId => {
            //if (index >= 10) return;
            this.listOfPromiseOfAuctionsUrls.push(pqueue.add(async () => await this.getAuctionsByRealmId(realmId)));
            index++;
        });
    }
    async resolveAllAuctionsUrls() {
        console.log("---crawl de toutes les urls...---");
        return await Promise.allSettled(this.listOfPromiseOfAuctionsUrls).catch((e) => {
            console.log(e);
        });
    }
    async _getRealmPromise(realmId) {
        return await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log(e);
        });
    }
    isItemSearched(itemId) {
        return CONFIG.listItems.max70.includes(itemId) || CONFIG.listItems.max10.includes(itemId);
    }
    isPriceItemOk(item) {
        if (CONFIG.listItems.max70.includes(item.item.id)) {
            return (item.buyout / 10000) <= 7000;
        }
        if (CONFIG.listItems.max10.includes(item.item.id)) {
            return (item.buyout / 10000) <= 10;
        }
        return false;
    }
    async run() {
        await this.getConnectedRealms();
        await this._reduceQueueUrlsOfAuctionsOfConnectedRealms();
        await this.resolveAllAuctionsUrls();
        console.log("----DONE, WAIT FOR RESTART NEW SCAN----");
        return "done";
    }
}
let spot;
// setInterval(() => {
//     spot = new Spotitem(oauthClient);
//     spot.run().then((response) => {
//         console.log(response);
//     });
// }, 180000)
spot = new Spotitem(oauthClient);
spot.run().then((response) => {
    console.log(response);
});
