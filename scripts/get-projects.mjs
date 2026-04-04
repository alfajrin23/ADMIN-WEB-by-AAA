import { writeFileSync } from "node:fs";

const SUPABASE_URL = "https://zlmqryxznxgozneibmej.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f7xCtyQpLreruaYVnQVbhQ_30m59oN2";

fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name`, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
})
  .then((response) => response.json())
  .then((data) => {
    writeFileSync("projects-debug.json", JSON.stringify(data, null, 2));
  });
