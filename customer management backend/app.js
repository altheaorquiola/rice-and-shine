const http = require("http");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const PORT = 3000;

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json"
    });
    res.end(JSON.stringify(data));
}

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    try {

        // =========================
        // TEST BACKEND
        // =========================

        if (req.method === "GET" && req.url === "/api/test") {
            sendJSON(res, 200, {
                success: true,
                message: "Rice & Shine backend is working!"
            });
            return;
        }


        // =========================
        // GET ALL RICE
        // =========================

        if (req.method === "GET" && req.url === "/api/rice") {

            const [rows] = await db.query(`
                SELECT
                    r.id,
                    r.name,
                    r.category,
                    r.price_wholesale,
                    r.price_retail,
                    r.is_available,
                    COALESCE(i.stock_quantity, 0) AS stock_quantity
                FROM rice_varieties r
                LEFT JOIN inventory i
                    ON r.id = i.rice_id
                ORDER BY r.category, r.name
            `);

            sendJSON(res, 200, {
                success: true,
                rice: rows
            });

            return;
        }


        // =========================
        // ADD RICE
        // =========================

        if (req.method === "POST" && req.url === "/api/rice") {

            const data = await getRequestBody(req);

            if (!data.name || !data.category) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Name and category are required."
                });
                return;
            }

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                const [result] = await connection.query(
                    `
                    INSERT INTO rice_varieties
                    (
                        name,
                        category,
                        price_wholesale,
                        price_retail,
                        is_available
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        data.name,
                        data.category,
                        data.price_wholesale ?? null,
                        data.price_retail ?? null,
                        data.is_available !== false
                    ]
                );

                const stock = Number(data.stock_quantity) || 0;

                await connection.query(
                    `
                    INSERT INTO inventory
                    (
                        rice_id,
                        stock_quantity
                    )
                    VALUES (?, ?)
                    `,
                    [result.insertId, stock]
                );

                if (stock > 0) {
                    await connection.query(
                        `
                        INSERT INTO stock_movements
                        (
                            rice_id,
                            movement_type,
                            quantity,
                            notes
                        )
                        VALUES (?, 'Stock Added', ?, ?)
                        `,
                        [
                            result.insertId,
                            stock,
                            "Initial stock"
                        ]
                    );
                }

                await connection.commit();

                sendJSON(res, 201, {
                    success: true,
                    message: "Rice variety added successfully.",
                    id: result.insertId
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

            return;
        }


        // =========================
        // UPDATE RICE
        // =========================

        const updateRiceMatch =
            req.url.match(/^\/api\/rice\/(\d+)$/);

        if (req.method === "PUT" && updateRiceMatch) {

            const riceId = Number(updateRiceMatch[1]);
            const data = await getRequestBody(req);

            if (!data.name || !data.category) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Name and category are required."
                });
                return;
            }

            const [result] = await db.query(
                `
                UPDATE rice_varieties
                SET
                    name = ?,
                    category = ?,
                    price_wholesale = ?,
                    price_retail = ?,
                    is_available = ?
                WHERE id = ?
                `,
                [
                    data.name,
                    data.category,
                    data.price_wholesale ?? null,
                    data.price_retail ?? null,
                    data.is_available !== false,
                    riceId
                ]
            );

            if (result.affectedRows === 0) {
                sendJSON(res, 404, {
                    success: false,
                    message: "Rice variety not found."
                });
                return;
            }

            sendJSON(res, 200, {
                success: true,
                message: "Rice variety updated successfully."
            });

            return;
        }


        // =========================
        // DELETE RICE
        // =========================

        const deleteRiceMatch =
            req.url.match(/^\/api\/rice\/(\d+)$/);

        if (req.method === "DELETE" && deleteRiceMatch) {

            const riceId = Number(deleteRiceMatch[1]);

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                const [riceRows] = await connection.query(
                    `
                    SELECT id
                    FROM rice_varieties
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [riceId]
                );

                if (riceRows.length === 0) {
                    await connection.rollback();

                    sendJSON(res, 404, {
                        success: false,
                        message: "Rice variety not found."
                    });

                    return;
                }

                await connection.query(
                    `
                    DELETE FROM stock_movements
                    WHERE rice_id = ?
                    `,
                    [riceId]
                );

                await connection.query(
                    `
                    DELETE FROM inventory
                    WHERE rice_id = ?
                    `,
                    [riceId]
                );

                await connection.query(
                    `
                    DELETE FROM rice_varieties
                    WHERE id = ?
                    `,
                    [riceId]
                );

                await connection.commit();

                sendJSON(res, 200, {
                    success: true,
                    message: "Rice variety deleted successfully."
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

            return;
        }


        // =========================
        // ADD STOCK
        // =========================

        const stockMatch =
            req.url.match(/^\/api\/rice\/(\d+)\/stock$/);

        if (req.method === "POST" && stockMatch) {

            const riceId = Number(stockMatch[1]);
            const data = await getRequestBody(req);
            const quantity = Number(data.quantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Quantity must be a positive whole number."
                });
                return;
            }

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                const [rice] = await connection.query(
                    `
                    SELECT id
                    FROM rice_varieties
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [riceId]
                );

                if (rice.length === 0) {
                    await connection.rollback();

                    sendJSON(res, 404, {
                        success: false,
                        message: "Rice variety not found."
                    });

                    return;
                }

                await connection.query(
                    `
                    INSERT INTO inventory
                    (rice_id, stock_quantity)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE
                    stock_quantity =
                    stock_quantity + VALUES(stock_quantity)
                    `,
                    [riceId, quantity]
                );

                await connection.query(
                    `
                    INSERT INTO stock_movements
                    (
                        rice_id,
                        movement_type,
                        quantity,
                        notes
                    )
                    VALUES (?, 'Stock Added', ?, ?)
                    `,
                    [
                        riceId,
                        quantity,
                        data.notes || "Stock added"
                    ]
                );

                await connection.commit();

                sendJSON(res, 200, {
                    success: true,
                    message: "Stock added successfully."
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

            return;
        }


        // =========================
        // DAMAGED STOCK
        // =========================

        const damagedMatch =
            req.url.match(/^\/api\/rice\/(\d+)\/damaged$/);

        if (req.method === "POST" && damagedMatch) {

            const riceId = Number(damagedMatch[1]);
            const data = await getRequestBody(req);
            const quantity = Number(data.quantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Quantity must be a positive whole number."
                });
                return;
            }

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                const [rows] = await connection.query(
                    `
                    SELECT stock_quantity
                    FROM inventory
                    WHERE rice_id = ?
                    FOR UPDATE
                    `,
                    [riceId]
                );

                if (rows.length === 0) {
                    await connection.rollback();

                    sendJSON(res, 404, {
                        success: false,
                        message: "Inventory record not found."
                    });

                    return;
                }

                const currentStock =
                    Number(rows[0].stock_quantity);

                if (quantity > currentStock) {
                    await connection.rollback();

                    sendJSON(res, 400, {
                        success: false,
                        message:
                            "Damaged quantity exceeds available stock."
                    });

                    return;
                }

                await connection.query(
                    `
                    UPDATE inventory
                    SET stock_quantity =
                        stock_quantity - ?
                    WHERE rice_id = ?
                    `,
                    [quantity, riceId]
                );

                await connection.query(
                    `
                    INSERT INTO stock_movements
                    (
                        rice_id,
                        movement_type,
                        quantity,
                        notes
                    )
                    VALUES (?, 'Damaged', ?, ?)
                    `,
                    [
                        riceId,
                        quantity,
                        data.notes || "Damaged stock"
                    ]
                );

                await connection.commit();

                sendJSON(res, 200, {
                    success: true,
                    message:
                        "Damaged stock recorded successfully."
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

            return;
        }


        // =========================
        // GET ALL CUSTOMERS
        // =========================

        if (req.method === "GET" && req.url === "/api/customers") {

            const [rows] = await db.query(`
                SELECT
                    id,
                    name,
                    phone,
                    email,
                    address,
                    credit_balance,
                    created_at
                FROM customers
                ORDER BY name
            `);

            sendJSON(res, 200, {
                success: true,
                customers: rows
            });

            return;
        }


        // =========================
        // ADD CUSTOMER
        // =========================

        if (req.method === "POST" && req.url === "/api/customers") {

            const data = await getRequestBody(req);

            if (!data.name) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Customer name is required."
                });

                return;
            }

            const [result] = await db.query(
                `
                INSERT INTO customers
                (
                    name,
                    phone,
                    email,
                    address,
                    credit_balance
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    data.name,
                    data.phone ?? null,
                    data.email ?? null,
                    data.address ?? null,
                    Number(data.credit_balance) || 0
                ]
            );

            sendJSON(res, 201, {
                success: true,
                message: "Customer added successfully.",
                id: result.insertId
            });

            return;
        }


        // =========================
        // UPDATE CUSTOMER
        // =========================

        const updateCustomerMatch =
            req.url.match(/^\/api\/customers\/(\d+)$/);

        if (req.method === "PUT" && updateCustomerMatch) {

            const customerId =
                Number(updateCustomerMatch[1]);

            const data = await getRequestBody(req);

            if (!data.name) {
                sendJSON(res, 400, {
                    success: false,
                    message: "Customer name is required."
                });

                return;
            }

            const [result] = await db.query(
                `
                UPDATE customers
                SET
                    name = ?,
                    phone = ?,
                    email = ?,
                    address = ?,
                    credit_balance = ?
                WHERE id = ?
                `,
                [
                    data.name,
                    data.phone ?? null,
                    data.email ?? null,
                    data.address ?? null,
                    Number(data.credit_balance) || 0,
                    customerId
                ]
            );

            if (result.affectedRows === 0) {
                sendJSON(res, 404, {
                    success: false,
                    message: "Customer not found."
                });

                return;
            }

            sendJSON(res, 200, {
                success: true,
                message: "Customer updated successfully."
            });

            return;
        }


        // =========================
        // DELETE CUSTOMER
        // =========================

        const deleteCustomerMatch =
            req.url.match(/^\/api\/customers\/(\d+)$/);

        if (req.method === "DELETE" && deleteCustomerMatch) {

            const customerId =
                Number(deleteCustomerMatch[1]);

            const [result] = await db.query(
                `
                DELETE FROM customers
                WHERE id = ?
                `,
                [customerId]
            );

            if (result.affectedRows === 0) {
                sendJSON(res, 404, {
                    success: false,
                    message: "Customer not found."
                });

                return;
            }

            sendJSON(res, 200, {
                success: true,
                message: "Customer deleted successfully."
            });

            return;
        }


        // =========================
        // FRONTEND
        // =========================

        if (req.method === "GET" && req.url === "/") {

            const filePath =
                path.join(__dirname, "index.html");

            fs.readFile(filePath, (error, data) => {

                if (error) {
                    res.writeHead(500, {
                        "Content-Type": "text/plain"
                    });

                    res.end("Could not load index.html.");
                    return;
                }

                res.writeHead(200, {
                    "Content-Type": "text/html"
                });

                res.end(data);
            });

            return;
        }


        // CSS
        if (req.method === "GET" && req.url === "/style.css") {

            const filePath =
                path.join(__dirname, "style.css");

            fs.readFile(filePath, (error, data) => {

                if (error) {
                    res.writeHead(404);
                    res.end("style.css not found.");
                    return;
                }

                res.writeHead(200, {
                    "Content-Type": "text/css"
                });

                res.end(data);
            });

            return;
        }


        // ROUTE NOT FOUND

        sendJSON(res, 404, {
            success: false,
            message: "Route not found."
        });

    } catch (error) {

        console.error("Backend error:", error);

        sendJSON(res, 500, {
            success: false,
            message: "Internal server error."
        });
    }
});

server.listen(PORT, () => {
    console.log(
        `Rice & Shine backend running at http://localhost:${PORT}`
    );
});