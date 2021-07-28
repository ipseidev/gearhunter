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

            if (auction.auctions?.horde) {
                await auction.auctions?.horde?.auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        console.log(getName(bid.item.id))
                        notify._notify(server, bid, "horde");
                    }
                })
            }

            if (auction.auctions?.alliance) {
                await auction.auctions?.alliance?.auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        console.log(getName(bid.item.id))
                        notify._notify(server, bid, "alliance");
                    }
                })
            }

        } catch (e) {
            console.log(e);
        }
        console.log(this.queue._queue._queue.length);
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
        return CONFIG.listItems.max70.includes(itemId) || CONFIG.listItems.max10.includes(itemId)
    }

    isPriceItemOk(item: any): boolean {
        if (item.buyout === 0) return false;
        if (CONFIG.listItems.max70.includes(item.item.id)) {
            return (item.buyout / 10000) <= 70
        }
        if (CONFIG.listItems.max10.includes(item.item.id)) {
            return (item.buyout / 10000) <= 10
        }
        return false;
    }

    async run() {
        await this.getConnectedRealms();
        await this._reduceQueueUrlsOfAuctionsOfConnectedRealms();
        await this.resolveAllAuctionsUrls();
        console.log("----DONE, WAIT FOR RESTART NEW SCAN----")
        return "done";
    }
}


setInterval(async () => {
    const oauthClient = new OauthClient({oauthOptions});
    const pqueue = new PQueue.default({concurrency: 1});
    let spot = new Spotitem(oauthClient, pqueue);
    await spot.run();
}, 180000)


