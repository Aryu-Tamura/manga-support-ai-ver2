/** @type {import("prettier").Config} */
const config = {
  singleQuote: false,
  semi: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: "all",
  plugins: ["prettier-plugin-tailwindcss"]
};

export default config;
