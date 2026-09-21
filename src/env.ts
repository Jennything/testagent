// Side-effect-only module: loads .env into process.env as soon as it's
// required. Some libraries (e.g. the Cloudinary SDK) read process.env at
// import time, before a module's own `dotenv.config()` call further down
// the file gets a chance to run — importing this module FIRST, before
// anything else, guarantees .env is loaded before any such library sees it.
import dotenv from "dotenv";
dotenv.config();
