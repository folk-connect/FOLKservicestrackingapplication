const axios = require("axios");

const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_API_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";


// ✅ DEFINE TABLE NAME (THIS WAS MISSING)
const TABLE_NAME = "Employees";

async function loginUser(email, password) {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLE_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`
        },
        params: {
          filterByFormula: `
            AND(
              {email}='${email}',
              {password}='${password}',
              OR({Active Status}='Yes', {Active Status}='Active')
            )
          `
        }
      }
    );

    if (!response.data.records.length) return null;

    const user = response.data.records[0].fields;

    return {
      empId: user.empId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.Department,
      photo: user.Photo?.[0]?.url || null
    };
  } catch (err) {
    console.error("Airtable login error:", err.message);
    return null;
  }
}

module.exports = { loginUser };
