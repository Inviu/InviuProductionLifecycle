import express from "express";
import { ENV } from "./config/env.js";
import { db } from "./config/db.js";
import {
  productsTable,
  processesTable,
  productProcessMappingTable,
  machinesTable,
  machineProcessMappingTable,
  productionEntryTable,
} from "./db/schema.js";
import { eq, inArray } from "drizzle-orm";
import job from "./config/cron.js";

//new imports

import { ordersTable, orderProcessesTable } from "./db/schema.js";
import { orderProcessMachineTable } from "./db/schema.js";
import { productProcessInventoryTable } from "./db/schema.js";

import { and } from "drizzle-orm";

const app = express();
const PORT = ENV.PORT || 5001;

import cors from "cors";

app.use(cors());

// Start the cron job
if (ENV.NODE_ENV === "production") job.start();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "true" });
});

app.post("/api/createProduct", async (req, res) => {
  try {
    const { productName, description } = req.body;

    if (!productName) {
      return res.status(400).json({ error: "productName is required" });
    }

    const newProduct = await db
      .insert(productsTable)
      .values({
        name: productName,
        description,
      })
      .returning();

    res.status(201).json(newProduct[0]);
  } catch (error) {
    console.error("Error creating product:", error);
    res
      .status(500)
      .json({ error: "Failed to create product", details: error.message });
  }
});
app.delete("/api/deleteProduct/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await db
      .delete(productsTable)
      .where(eq(productsTable.id, Number(id)))
      .returning();
    if (deletedProduct.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json(deletedProduct[0]);
  } catch (error) {
    console.error("Error deleting product:", error);
    res
      .status(500)
      .json({ error: "Failed to delete product", details: error.message });
  }
});
app.get("/api/getProducts/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, Number(productId)));
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch products", details: error.message });
  }
});

app.get("/api/getAllProducts", async (req, res) => {
  try {
    const products = await db.select().from(productsTable);
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch products", details: error.message });
  }
});

app.get("/api/getprocess/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    // Join so processes come back in the product's defined sequence
    // (mapping insertion order), not whatever order the DB returns.
    const processes = await db
      .select({
        id: processesTable.id,
        name: processesTable.name,
        createdAt: processesTable.createdAt,
      })
      .from(productProcessMappingTable)
      .innerJoin(
        processesTable,
        eq(processesTable.id, productProcessMappingTable.processId)
      )
      .where(eq(productProcessMappingTable.productId, Number(productId)))
      .orderBy(productProcessMappingTable.id);

    res.status(200).json(processes);
  } catch (error) {
    console.error("Error fetching processes:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch processes", details: error.message });
  }
});

app.get("/api/getMachines/:processId", async (req, res) => {
  try {
    const { processId } = req.params;

    const process = await db
      .select()
      .from(processesTable)
      .where(eq(processesTable.id, Number(processId)));

    if (process.length === 0) {
      return res.status(404).json({ error: "Process not found" });
    }

    const mappings = await db
      .select({ machineId: machineProcessMappingTable.machineId })
      .from(machineProcessMappingTable)
      .where(eq(machineProcessMappingTable.processId, Number(processId)));

    if (mappings.length === 0) {
      return res.status(200).json({
        message: "No machines available for this process",
        machines: [],
      });
    }

    const machineIds = mappings.map((m) => m.machineId);
    const machines = await db
      .select()
      .from(machinesTable)
      .where(inArray(machinesTable.id, machineIds));

    res.status(200).json({ machines: machines });
  } catch (error) {
    console.error("Error fetching machines:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch machines", details: error.message });
  }
});

app.post("/api/createProductionEntry", async (req, res) => {
  try {
    const {
      productId,
      processId,
      machineId,
      workerName,
      shiftStartTime,
      shiftEndTime,
      unitsProduced,
      date,
      productionIssueReason,
    } = req.body;

    if (
      !productId ||
      !processId ||
      !workerName ||
      !shiftStartTime ||
      !shiftEndTime ||
      !unitsProduced
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: productId, processId, workerName, shiftStartTime, shiftEndTime, unitsProduced",
      });
    }

    const entryDate = date ? new Date(date) : new Date();
    const dateString = entryDate.toISOString().split("T")[0];

    const startDateTime = new Date(`${dateString}T${shiftStartTime}:00Z`);
    const endDateTime = new Date(`${dateString}T${shiftEndTime}:00Z`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return res.status(400).json({
        error: "Invalid time format. Please use HH:MM format for times",
      });
    }

    let reasonValue = null;
    if (productionIssueReason) {
      if (Array.isArray(productionIssueReason)) {
        // If it's an array, store as JSON
        reasonValue = JSON.stringify(productionIssueReason);
      } else if (typeof productionIssueReason === "string") {
        // If it's a string, store as is
        reasonValue = productionIssueReason;
      }
    }

    const newEntry = await db
      .insert(productionEntryTable)
      .values({
        productId: Number(productId),
        processId: Number(processId),
        machineId: machineId ? Number(machineId) : null,
        workerName,
        shiftStartTime: startDateTime,
        shiftEndTime: endDateTime,
        date: entryDate,
        unitsProduced: Number(unitsProduced),
        productionIssueReason: reasonValue,
      })
      .returning();

    res.status(201).json(newEntry[0]);
  } catch (error) {
    console.error("Error creating production entry:", error);
    res.status(500).json({
      error: "Failed to create production entry",
      details: error.message,
    });
  }
});

// new apis

app.get("/api/work-orders", async (req, res) => {
  try {
    // Join product so the list can show the product name (the UI's
    // "Product Type" column and product filter rely on this).
    const orders = await db
      .select({
        id: ordersTable.id,
        customerName: ordersTable.customerName,
        productId: ordersTable.productId,
        productType: productsTable.name,
        quantity: ordersTable.quantity,
        status: ordersTable.status,
        createdDate: ordersTable.createdDate,
        dueDate: ordersTable.dueDate,
      })
      .from(ordersTable)
      .innerJoin(productsTable, eq(productsTable.id, ordersTable.productId))
      .orderBy(ordersTable.id);

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching work orders:", error);
    res.status(500).json({ error: "Failed to fetch work orders" });
  }
});

app.post("/api/work-orders", async (req, res) => {
  try {
    const { customerName, productId, quantity, dueDate, processes } = req.body;

    if (!customerName || !productId || !quantity || !processes?.length) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // 1️⃣ create order
    const [order] = await db
      .insert(ordersTable)
      .values({
        customerName,
        productId,
        quantity,
        dueDate,
        status: "Pending",
      })
      .returning();

    // 2️⃣ create processes + machines
    for (const p of processes) {
      const [orderProcess] = await db
        .insert(orderProcessesTable)
        .values({
          orderId: order.id,
          processId: p.processId,
          sequence: p.sequence,
          availableQuantity: p.availableQuantity,
          completedQuantity: p.completedQuantity,
          status: p.status,
        })
        .returning();

      for (const m of p.machines) {
        await db.insert(orderProcessMachineTable).values({
          orderProcessId: orderProcess.id,
          machineId: m.machineId,
          assignedQuantity: m.assignedQuantity,
        });
      }
    }

    res.status(201).json(order);
  } catch (error) {
    console.error("Create order failed:", error);
    res.status(500).json({ error: "Failed to create work order" });
  }
});

app.put("/api/work-orders/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { customerName, productId, quantity, dueDate, processes } = req.body;

    if (!orderId || !processes?.length) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // 1️⃣ Update order (basic fields only)
    await db
      .update(ordersTable)
      .set({
        customerName,
        productId,
        quantity,
        dueDate,
      })
      .where(eq(ordersTable.id, orderId));

    // 2️⃣ Loop through processes
    for (const p of processes) {
      // Fetch existing order_process row
      const [existingProcess] = await db
        .select()
        .from(orderProcessesTable)
        .where(
          and(
            eq(orderProcessesTable.orderId, orderId),
            eq(orderProcessesTable.processId, p.processId)
          )
        );

      if (!existingProcess) continue;

      let updatedCompletedQty = existingProcess.completedQuantity;

      // 3️⃣ Inventory usage logic
      if (p.inventoryUsed && p.inventoryUsed > 0) {
        const [inventory] = await db
          .select()
          .from(productProcessInventoryTable)
          .where(
            and(
              eq(productProcessInventoryTable.productId, productId),
              eq(productProcessInventoryTable.processId, p.processId)
            )
          );

        if (!inventory || inventory.availableQuantity < p.inventoryUsed) {
          return res.status(400).json({
            error: `Insufficient inventory for process ${p.processId}`,
          });
        }

        // 3a️⃣ Decrement inventory FIRST
        await db
          .update(productProcessInventoryTable)
          .set({
            availableQuantity: inventory.availableQuantity - p.inventoryUsed,
          })
          .where(eq(productProcessInventoryTable.id, inventory.id));

        // 3b️⃣ Increase completed quantity
        updatedCompletedQty += p.inventoryUsed;
      }

      // 4️⃣ Update order_process
      await db
        .update(orderProcessesTable)
        .set({
          availableQuantity: p.availableQuantity,
          completedQuantity: updatedCompletedQty,
          status:
            p.availableQuantity > 0 &&
            updatedCompletedQty >= p.availableQuantity
              ? "Completed"
              : p.status,
        })
        .where(eq(orderProcessesTable.id, existingProcess.id));

      // 5️⃣ Machines — ONLY update assignments (no completed qty)
      if (Array.isArray(p.machines)) {
        // delete old assignments
        await db
          .delete(orderProcessMachineTable)
          .where(
            eq(orderProcessMachineTable.orderProcessId, existingProcess.id)
          );

        // insert new assignments
        for (const m of p.machines) {
          await db.insert(orderProcessMachineTable).values({
            orderProcessId: existingProcess.id,
            machineId: m.machineId,
            assignedQuantity: m.assignedQuantity,
          });
        }
      }
    }

    res.json({ message: "Work order updated successfully" });
  } catch (error) {
    console.error("Update order failed:", error);
    res.status(500).json({ error: "Failed to update work order" });
  }
});

app.get("/api/work-orders/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // join processes with process name
    const processes = await db
      .select({
        id: orderProcessesTable.id,
        processId: orderProcessesTable.processId,
        processName: processesTable.name,
        availableQuantity: orderProcessesTable.availableQuantity,
        completedQuantity: orderProcessesTable.completedQuantity,
        status: orderProcessesTable.status,
        sequence: orderProcessesTable.sequence,
      })
      .from(orderProcessesTable)
      .innerJoin(
        processesTable,
        eq(processesTable.id, orderProcessesTable.processId)
      )
      .where(eq(orderProcessesTable.orderId, orderId))
      .orderBy(orderProcessesTable.sequence);

    const processIds = processes.map((p) => p.id);

    // join machines with machine name
    const machines = processIds.length
      ? await db
          .select({
            orderProcessId: orderProcessMachineTable.orderProcessId,
            machineId: machinesTable.id,
            machineName: machinesTable.name,
            assignedQuantity: orderProcessMachineTable.assignedQuantity,
            completedQuantity: orderProcessMachineTable.completedQuantity,
          })
          .from(orderProcessMachineTable)
          .innerJoin(
            machinesTable,
            eq(machinesTable.id, orderProcessMachineTable.machineId)
          )
          .where(inArray(orderProcessMachineTable.orderProcessId, processIds))
      : [];

    res.json({
      ...order,
      processes: processes.map((p) => ({
        processId: p.processId,
        processName: p.processName,
        availableQuantity: p.availableQuantity,
        completedQuantity: p.completedQuantity,
        status: p.status,
        sequence: p.sequence,
        machines: machines.filter((m) => m.orderProcessId === p.id),
      })),
    });
  } catch (error) {
    console.error("Get order failed:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

app.get(
  "/api/inventory/product/:productId/process/:processId",
  async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      const processId = Number(req.params.processId);

      const inventory = await db
        .select({
          availableQuantity: productProcessInventoryTable.availableQuantity,
        })
        .from(productProcessInventoryTable)
        .where(
          and(
            eq(productProcessInventoryTable.productId, productId),
            eq(productProcessInventoryTable.processId, processId)
          )
        );

      if (!inventory.length) {
        return res.status(200).json({ availableQuantity: 0 });
      }

      res.status(200).json({
        availableQuantity: inventory[0].availableQuantity,
      });
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  }
);

// Seed machines for processes that have none
// app.get("/api/seed/machines", async (req, res) => {
//   try {
//     const allProcesses = await db.select().from(processesTable);

//     for (const process of allProcesses) {
//       const existing = await db
//         .select()
//         .from(machineProcessMappingTable)
//         .where(eq(machineProcessMappingTable.processId, process.id));

//       if (existing.length === 0) {
//         const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
//         for (let i = 1; i <= count; i++) {
//           const [machine] = await db
//             .insert(machinesTable)
//             .values({ name: `${process.name} Machine ${i}` })
//             .returning();

//           await db.insert(machineProcessMappingTable).values({
//             machineId: machine.id,
//             processId: process.id,
//           });
//         }
//         console.log(`Added ${count} machines for process: ${process.name}`);
//       }
//     }

//     res.json({ message: "Machines seeded successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Seed inventory for product-process pairs that have none
// app.get("/api/seed/inventory", async (req, res) => {
//   try {
//     const products = await db.select().from(productsTable);

//     for (const product of products) {
//       const mappings = await db
//         .select()
//         .from(productProcessMappingTable)
//         .where(eq(productProcessMappingTable.productId, product.id));

//       for (const mapping of mappings) {
//         const existing = await db
//           .select()
//           .from(productProcessInventoryTable)
//           .where(
//             and(
//               eq(productProcessInventoryTable.productId, product.id),
//               eq(productProcessInventoryTable.processId, mapping.processId)
//             )
//           );

//         if (existing.length === 0) {
//           const qty = 30 + Math.floor(Math.random() * 71); // 30-100
//           await db.insert(productProcessInventoryTable).values({
//             productId: product.id,
//             processId: mapping.processId,
//             availableQuantity: qty,
//           });
//           console.log(
//             `Added inv ${qty} for product ${product.id}, process ${mapping.processId}`
//           );
//         }
//       }
//     }

//     res.json({ message: "Inventory seeded successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

app.listen(PORT, () => {
  console.log("Server started on port:", PORT);
});
