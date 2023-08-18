import { GraphQLDefinitionsFactory } from "@nestjs/graphql";
import { join } from "path";

const definitionsFactory = new GraphQLDefinitionsFactory();

definitionsFactory.generate({
  typePaths: ["./src/queries/**/*.graphql"],
  path: join(process.cwd(), "src/queries/graphql/graphql.ts"),
  outputAs: "class",
  emitTypenameField: true,
  watch: false,
});
