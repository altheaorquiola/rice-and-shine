require("dotenv").config();
const mysql = require("mysql2/promise");

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "rice_and_shine",
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10
});

async function testDatabase() {
    try {
        const connection = await db.getConnection();

        console.log("MySQL connection successful!");

        connection.release();
    } catch (error) {
        console.error("MySQL connection failed:");
        console.error(error.message);
    }
}

testDatabase();

module.exports = db;