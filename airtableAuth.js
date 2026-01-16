// airtableAuth.js
const axios = require("axios");

const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_API_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";
const TABLE_NAME = "Employees";

function escapeFormulaValue(value = "") {
  return value.replace(/'/g, "\\'");
}

async function loginUser(email, password) {
  try {
    const safeEmail = escapeFormulaValue(email);
    const safePassword = escapeFormulaValue(password);

    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLE_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`
        },
        params: {
          filterByFormula: `
            AND(
              {Email}='${safeEmail}',
              {Password}='${safePassword}',
              OR({Active Status}='Yes', {Active Status}='Active')
            )
          `
        }
      }
    );

    if (!response.data.records.length) return null;

    const f = response.data.records[0].fields;

    return {
      empId: f["Emp ID"],
      name: f["Name"],
      email: f["Email"],
      role: f["Role"],
      department: f["Department"],
      photo: f["Photo"]?.[0]?.url || null
    };

  } catch (err) {
    console.error("Airtable login error:", err.message);
    return null;
  }
}

module.exports = { loginUser };
