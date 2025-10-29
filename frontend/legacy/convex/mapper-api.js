import { convex } from "./client.js";

export function createMapperAPI() {
  return {
    async create(catData) {
      return convex.mutation("mapper:create", { catData });
    },

    async get(id) {
      if (!id) return null;
      return convex.query("mapper:get", { id });
    }
  };
}

const mapperApi = createMapperAPI();
export default mapperApi;
