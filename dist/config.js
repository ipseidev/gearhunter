"use strict";
module.exports = {
    apiHosts: {
        us: "https://us.api.blizzard.com",
        eu: "https://eu.api.blizzard.com",
        kr: "https://kr.api.blizzard.com",
        tw: "https://tw.api.blizzard.com",
    },
    namespaces: {
        profile: {
            us: "profile-us",
            eu: "profile-eu",
            kr: "profile-kr",
            tw: "profile-tw",
        },
        static: {
            us: "static-us",
            eu: "static-eu",
            kr: "static-kr",
            tw: "static-tw",
        }
    },
    listItems: {
        max15: [2271, 1486],
        max20: [1974, 776],
        max40: [9491, 9510],
        max60: [1482, 1935, 9425]
    }
};
