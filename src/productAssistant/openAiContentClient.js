import { getCategoryPromptList } from "./catalogRules.js";
import { PRODUCT_CARD_PLAYBOOK } from "./productCardPolicy.js";
import { getStyleExamplesForPrompt } from "./styleExamples.js";

export class OpenAiContentClient {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateProductContent(input) {
    const imageUrl = input.imageDataUrl || input.imageUrl;
    const userContent = [
      {
        type: "input_text",
        text: JSON.stringify({
          task: "Generate a complete ecommerce product card from the seller hint and image when available.",
          requiredJsonFields: [
            "nameUk",
            "nameEn",
            "descriptionUk",
            "descriptionEn",
            "seoTitleUk",
            "seoDescriptionUk",
            "seoKeywordsUk",
            "slug",
            "brand",
            "category",
            "productTypeUk",
            "productTypeEn",
            "visibleSummaryUk"
          ],
          editorialPlaybook: PRODUCT_CARD_PLAYBOOK,
          businessRules: {
            languages: ["uk", "en"],
            tone:
              "premium floral and gift boutique, warm, sensual, elegant, lightly French-inspired, concise and natural",
            compositionDisclosure:
              "For bouquets and flower boxes, name the 1-3 main flowers when they are confidently visible or readable, but do not list every stem, greenery, filler, or complete composition. Write a premium description about the main flowers, form, silhouette, palette, occasion, and feeling; it must read like boutique copy, not a recipe or inventory list.",
            ocrFirst:
              "Before identifying the product visually, inspect the image for readable text: labels, stickers, tags, price labels, plant pots, packaging, and printed product names. If readable text names a plant, fragrance, brand, cultivar, or product model, treat that text as the strongest factual evidence. For indoor plants, use the readable plant name in productTypeUk/productTypeEn and visibleSummaryUk when clear. Do not ignore a visible plant label and do not invent a different plant name from leaf shape when a readable label is present. If the text is partially readable, use only the confident part and keep the rest generic.",
            plantDescriptionStyle:
              "For indoor plants, use the plant name from OCR/label in productType and SEO when it is clear, but do not describe obvious morphology in the public description: no leaves, dense foliage, white spathes/covers, flowers, or statements that it is a plant. The photo already shows that. Write descriptionUk/descriptionEn around a calm green accent, placement in home or office, lasting gift value, cared-for atmosphere, and Nouvel Amour presentation. Avoid botanical textbook wording.",
            creativeNaming:
              "nameUk and nameEn are creative display names only, like a boutique collection title. Use 2-4 elegant words with a light French-inspired mood. Every product name must be meaningfully unique: do not reuse or closely imitate names from examples or previous cards. Never output these common fallback names: 'Lumiere Douce', 'Velours Secret', 'Jardin Secret', 'Maison Ambree', 'Maison Verte', 'Maison Vivante', 'Petit Ami', 'Mot Doux', 'Atelier Lesnikov', 'Offre Jolie', 'Belle Histoire'. Do not put product type, flower species, colors, packaging, category words, or inventory words in the name. Forbidden in names: букет, квіти, композиція, коробка, троянди, півонії, гортензія, орхідея, рожевий, білий, кремовий, зелений, bouquet, flower, rose, peony, pivoine, hydrangea, orchid, pink, white, cream, green. Put factual clarity into productTypeUk/productTypeEn, visibleSummaryUk, descriptions, and SEO instead.",
            descriptionStyle:
              "Write like a boutique florist and ecommerce merchandiser, not like a technical catalog and not like vague poetry. No phrases like 'товар у категорії', 'декоративний подарунок', 'гарний букет', 'створено з увагою', 'гармонія форми', 'підійде для подарунка, доповнення до квітів або самостійного замовлення', 'ефемерне відчуття', repeated 'чарівний', or other boilerplate. First say exactly what is visible: product type, up to 3 main flowers/items if confidently identifiable, color palette, packaging/form. Then add a short emotional/use-case sentence. Keep it 2-3 polished sentences.",
            premiumShortDescription:
              "For flowers, never make the whole description just an inventory like 'букет рожевих півоній та бузку'. Use the visible composition as a factual anchor, then turn it into premium boutique copy: color, texture, mood, occasion, and why it feels special. Good pattern: '<specific visual composition> звучить/виглядає як <emotion or occasion>. <One elegant sentence about who it is for or what feeling it gives>.' Avoid cheap words: шикарний, розкішний, ідеальний, найкращий, вау, незабутній unless there is a precise reason. Prefer elegant words: ніжний, м'який, камерний, витончений, повітряний, стриманий, романтичний, делікатний.",
            bannedDescriptionPhrases:
              "Never use vague filler such as 'свято душі', 'особливі моменти', 'особливих моментів', 'незабутні моменти', 'елегантний та живий акцент', 'продуманий жест', 'знак уваги', 'доповнює замовлення', 'декоративний подарунок', 'гарний букет', 'гарний варіант', 'створено з увагою', 'з увагою і гармонією', 'гармонія форми', 'гармонією форми', 'красивий жест', 'маленьке свято', 'не просто квіти, а настрій', 'ідеально підходить', 'будь-який привід'. These sound cheap and generic. Write like a real premium florist describing a real product to a demanding client.",
            seoRules:
              "Do not invent delivery terms, guarantees, country-wide availability, dimensions, flower counts, fragrance notes, materials, or exact varieties unless they are provided by the seller or visible with high confidence. SEO text must be useful and restrained.",
            categoryRules:
              "Choose exactly one category name from the provided categories list. Never invent a category. Choose by the physical product visible in the image: hand bouquet with stems = Букети; flowers arranged in a box/hatbox/basket = Квіти в коробках; living potted/decorative indoor plant, even in gift wrapping, paper, basket, pot, or decorative packaging = Кімнатні рослини; candle, diffuser, car perfume or aroma item = Арома товари; postcard/audio postcard = Листівки; plush/toy = Іграшки; designer By Lesnikov item = Авторські роботи By Lesnikov; real hot/discount offer only if seller says so = Гарячі пропозиції; non-living gift/decor/accessory only = Декор та подарунки. Never classify a bouquet, flower box, or living plant as Декор та подарунки just because it looks decorative or gift-ready. If seller text conflicts with the image, prefer the image unless the image is unclear.",
            sourceCategoryRule:
              "If input.sourceCategoryHint is present and is one of the allowed categories, keep that category exactly. Use the image to write the product type and description, but do not move imported/catalog items out of their source category.",
            revisionRule:
              "If input.revisionInstruction is present, treat it as the editor's instruction for improving a previous draft. Follow it closely while keeping factual product identity, price, category constraints, and visible image evidence. Never invent facts to make the copy sound richer.",
            categories: getCategoryPromptList(),
            stockRules:
              "Bouquets, flower boxes, author works, hot offers, aroma products, postcards, toys, decor and gifts are always available. Indoor plants use counted stock.",
            caution:
              "Use visible evidence from the image. If exact flower species, fragrance, size, or material is unclear, keep wording generic instead of inventing facts."
          },
          styleExamples:
            "Use these as living examples for tone, clarity and structure. Do not copy them verbatim unless the product is the same; adapt the pattern to the actual image.",
          examples: getStyleExamplesForPrompt(),
          existingNames: input.existingNames ?? [],
          input: {
            nameHint: input.nameHint,
            price: input.price,
            categoryHint: input.categoryHint,
            sourceCategoryHint: input.sourceCategoryHint,
            stockModeHint: input.stockModeHint,
            hasImage: input.hasImage,
            imageCount: Array.isArray(input.imageDataUrls) && input.imageDataUrls.length
              ? input.imageDataUrls.length
              : (input.imageDataUrl || input.imageUrl ? 1 : 0),
            revisionInstruction: input.revisionInstruction,
            imageDataUrl: input.imageDataUrl ? "[attached image]" : null,
            imageUrl: input.imageUrl ? "[public image URL attached]" : null
          }
        })
      }
    ];

    const imageUrls = [
      ...(Array.isArray(input.imageDataUrls) ? input.imageDataUrls : []),
      input.imageDataUrl,
      input.imageUrl
    ].filter(Boolean);
    for (const currentImageUrl of [...new Set(imageUrls)]) {
      userContent.push({
        type: "input_image",
        image_url: currentImageUrl,
        detail: "high"
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You create premium ecommerce product cards for Nouvel Amour, a floral and gift boutique with a French-inspired identity. Return only valid JSON with Ukrainian and English fields. No markdown. The product card must be commercially clear: a shopper must instantly understand what the item is."
              }
            ]
          },
          {
            role: "user",
            content: userContent
          }
        ],
        text: {
          format: {
            type: "json_object"
          }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`OpenAI content generation failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    const text = payload.output_text ?? extractOutputText(payload);
    return JSON.parse(text);
  }
}

function extractOutputText(payload) {
  const message = payload.output?.find((item) => item.type === "message");
  const outputText = message?.content?.find((item) => item.type === "output_text");
  if (outputText?.text) {
    return outputText.text;
  }

  throw new Error("OpenAI content generation failed: missing output_text");
}
