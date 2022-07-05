"use strict";
require('dotenv').config();
const axios = require('axios').default;
const PQueue = require('p-queue');
const getName = require('./utils/getItameName');
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
class Spotitem {
    constructor(oauthClient, queue) {
        this.listOfConnectedRealmsIds = [];
        this.listOfPromiseOfAuctionsUrls = [];
        this.oauthClient = oauthClient;
        this.queue = queue;
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
            console.log("Impossible de récupérer l'hôtel des ventes de l'alliance de ce serveur");
        });
        auction.auctions.alliance = alliance.data;
        const horde = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/6?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log("Impossible de récupérer l'hôtel des ventes de la horde de ce serveur");
        });
        auction.auctions.horde = horde.data;
        const neutre = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${realmId}/auctions/7?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`).catch((e) => {
            console.log("Impossible de récupérer l'hôtel des ventes neutre de ce serveur");
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
            const auctions = auction.auctions.horde.auctions || auction.auctions.alliance.auctions;
            const faction = auction.auctions.horde ? "horde" : auction.auctions.alliance ? "alliance" : null;
            if (auctions) {
                auctions.map((bid) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        if (this.isVariantSearched(bid.item.id, bid.item.rand)) {
                            console.log(getName(bid.item.id));
                            console.log(faction, bid.item);
                            console.log(faction, bid);
                            notify._notify(server, bid, faction);
                        }
                        else {
                            console.log("pas la bonne variante");
                        }
                    }
                });
            }
        }
        catch (e) {
            console.log("Le serveur ", server, " ne peut pas être scanné");
        }
        console.log("il reste ", this.queue._queue._queue.length, "serveurs à scanner...");
        console.log("---fin du scan---");
    }
    async _reduceQueueUrlsOfAuctionsOfConnectedRealms() {
        this.listOfPromiseOfAuctionsUrls = [];
        let index = 0;
        this.listOfConnectedRealmsIds.map(realmId => {
            this.listOfPromiseOfAuctionsUrls.push(this.queue.add(async () => await this.getAuctionsByRealmId(realmId)));
            index++;
        });
    }
    async resolveAllAuctionsUrls() {
        console.log("---crawl de toutes les urls....---");
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
        return CONFIG.listItems.all.some((item) => item.id === itemId);
    }
    isVariantSearched(itemId, variant) {
        const itemSearched = CONFIG.listItems.all.filter((item) => item.id === itemId);
        if (itemSearched[0].rand.length === 0)
            return true;
        return itemSearched[0].rand.includes(variant);
    }
    isPriceItemOk(bid) {
        if (bid.buyout === 0)
            return false;
        const itemSearched = CONFIG.listItems.all.filter((itemSearch) => bid.item.id === itemSearch.id);
        return (bid.buyout / 10000) <= itemSearched[0].price;
    }
    async run() {
        await this.getConnectedRealms();
        await this._reduceQueueUrlsOfAuctionsOfConnectedRealms();
        await this.resolveAllAuctionsUrls();
        console.log("----DONE, WAIT FOR RESTART NEW SCAN----");
        return "done";
    }
}
setImmediate(async () => {
    const oauthClient = new OauthClient({ oauthOptions });
    const pqueue = new PQueue.default({ concurrency: 1 });
    let spot = new Spotitem(oauthClient, pqueue);
    await spot.run();
});
setInterval(async () => {
    const oauthClient = new OauthClient({ oauthOptions });
    const pqueue = new PQueue.default({ concurrency: 1 });
    let spot = new Spotitem(oauthClient, pqueue);
    await spot.run();
}, 250000);
