"use strict";

require('dotenv').config()
const axios = require('axios').default;
const PQueue = require('p-queue');


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

const oauthClient = new OauthClient({oauthOptions});
const pqueue = new PQueue.default({concurrency: 1});


class Spotitem {
    private accessToken: string;
    private oauthClient: any;
    private listOfConnectedRealmsIds: Array<any> = [];
    private listOfPromiseOfAuctionsUrls: Array<Promise<any>> = [];

    constructor(oauthClient: any) {
        this.oauthClient = oauthClient;
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
                console.log('scan horde, taille : ', auction.auctions.horde.auctions.length);

                await auction.auctions?.horde?.auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        notify._notify(server, bid, "horde");
                    }
                })
            }

            if (auction.auctions?.alliance) {
                console.log('scan alliance, taille :', auction.auctions.alliance.auctions.length)
                await auction.auctions?.alliance?.auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        notify._notify(server, bid, "alliance");
                    }
                })
            }

            if (auction.auctions?.neutre) {
                console.log('scan neutre, taille :', auction.auctions.neutre.auctions.length)
                await auction.auctions?.neutre?.auctions.map((bid: any) => {
                    if (this.isItemSearched(bid.item.id) && this.isPriceItemOk(bid)) {
                        notify._notify(server, bid, "neutre");
                    }
                })
            }
        } catch (e) {
            console.log(e);
        }
        console.log(pqueue._queue._queue.length);
        console.log("---fin du scan---");
    }

    async _reduceQueueUrlsOfAuctionsOfConnectedRealms() {
        this.listOfPromiseOfAuctionsUrls = [];
        console.log('---Mise en queue de toutes les urls des auctions---')
        let index = 0;
        this.listOfConnectedRealmsIds.map(realmId => {
            //if (index >= 10) return;
            this.listOfPromiseOfAuctionsUrls.push(
                pqueue.add(async () => await this.getAuctionsByRealmId(realmId))
            );
            index++;
        });
    }

    async resolveAllAuctionsUrls() {
        console.log("---crawl de toutes les urls...---")
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
        let found = false;
        found = CONFIG.listItems.max60.includes(itemId);
        found = CONFIG.listItems.max40.includes(itemId);
        found = CONFIG.listItems.max20.includes(itemId);
        found = CONFIG.listItems.max15.includes(itemId);
        return found;
    }

    isPriceItemOk(item: any): boolean {
        if (CONFIG.listItems.max100.includes(item.item.id)) {
            return (item.buyout / 10000) <= 100
        }
        if (CONFIG.listItems.max60.includes(item.item.id)) {
            return (item.buyout / 10000) <= 60
        }
        if (CONFIG.listItems.max40.includes(item.item.id)) {
            return (item.buyout / 10000) <= 40
        }
        if (CONFIG.listItems.max20.includes(item.item.id)) {
            return (item.buyout / 10000) <= 20
        }
        if (CONFIG.listItems.max15.includes(item.item.id)) {
            return (item.buyout / 10000) <= 15
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


let spot;

setInterval(() => {
    spot = new Spotitem(oauthClient);
    spot.run().then((response) => {
        console.log(response);
    });
}, 180000)



