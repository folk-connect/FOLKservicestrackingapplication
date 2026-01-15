const axios = require("axios");

const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_TABLE = "tblLGHzETj8CeRcTD";
const API_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";

module.exports = async function (data) {
    try {
        await axios.post(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`,
            {
                records: [
                    {
                        fields: {
                            Employee: data.employee,
                            Device: data.device,
                            App: data.app,
                            Website: data.website || "",
                            Title: data.title,
                            "Duration (seconds)": data.duration_seconds,
                            "Duration": data.duration_text
                        }

                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (err) {
        console.error("Airtable error", err.message);
    }
};
