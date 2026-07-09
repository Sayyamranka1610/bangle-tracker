#!/usr/bin/env python3
"""
Siddhi Bangles — Backdrop Generator (Run Once)
===============================================
This script generates all 50 luxury backdrop images and saves them to the
backdrops/ folder. Run this ONCE. After that, enhance_bangles.py uses
these saved images forever — no more API costs per bangle.

TWO MODES:
  Mode 1 (AUTO):   Uses Imagen 3 API to generate all 50 automatically.
                   One-time cost ~$2. Runs in ~10 minutes.
                   Requires billing enabled on Google Cloud.

  Mode 2 (EXPORT): Exports all 50 prompts to a text file so you can
                   paste them into Google Flow one by one. Completely free.
                   Takes ~50 mins of manual work across 1-2 days.

Set MODE below before running.
"""

import os
import sys
import json

# ═══════════════════════════════════════════════════════════════════
#  CHOOSE YOUR MODE
#  "auto"   → generates with Imagen 3 API (needs billing, ~$2 one-time)
#  "export" → saves all prompts to a text file for Google Flow
# ═══════════════════════════════════════════════════════════════════
MODE = "auto"

# Only needed for Mode 1 (auto):
API_KEY = "YOUR_API_KEY_HERE"

OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backdrops")
# ═══════════════════════════════════════════════════════════════════


# ─── ALL 50 BACKDROP DEFINITIONS ────────────────────────────────────────────
# Each backdrop has:
#   id       : short code used by the matching script
#   filename : what to save the image as (must match enhance_bangles.py)
#   group    : which bangle tone/type it suits
#   name     : short human-readable label
#   elements : key visual elements (for your reference)
#   prompt   : the exact text to paste into Google Flow or send to Imagen 3

BACKDROPS = [

    # ══════════════════════════════════════════════════════════════
    # GROUP A — Gold / Yellow Gold / Warm-toned bangles  (12 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "A01",
        "filename": "A01_crimson_velvet_cushion.jpg",
        "group": "gold",
        "name": "Crimson Velvet Cushion",
        "elements": ["velvet cushion", "gold fringe", "warm light"],
        "prompt": (
            "Deep crimson velvet jewelry display cushion with golden tassel fringe trim along the edges, "
            "professional jewelry photography backdrop, soft warm studio lighting from slightly above, "
            "rich deep fabric texture clearly visible, empty surface ready for jewelry, "
            "no objects on the cushion, no text, ultra realistic commercial product photography, 4K quality."
        ),
    },
    {
        "id": "A02",
        "filename": "A02_burgundy_velvet_draped.jpg",
        "group": "gold",
        "name": "Burgundy Velvet Draped Cloth",
        "elements": ["draped velvet", "golden frills", "soft folds"],
        "prompt": (
            "Rich burgundy velvet cloth softly draped and folded, golden silk fringe cascading along one edge, "
            "luxury jewelry photography background, warm golden side lighting casting gentle shadows in the folds, "
            "deep rich fabric color, empty center for product placement, no jewelry visible, "
            "ultra realistic, professional commercial photography backdrop, 4K quality."
        ),
    },
    {
        "id": "A03",
        "filename": "A03_wine_red_silk_cushion.jpg",
        "group": "gold",
        "name": "Wine Red Silk Cushion",
        "elements": ["silk cushion", "gold embroidery", "luxury"],
        "prompt": (
            "Wine-red silk cushion with intricate gold embroidered border pattern along all edges, "
            "small decorative gold tassels at corners, jewelry photography backdrop, "
            "warm diffused studio lighting, smooth silk texture gleaming softly, "
            "empty center surface, no jewelry or objects placed on it, no text, "
            "ultra realistic luxury product photography, 4K quality."
        ),
    },
    {
        "id": "A04",
        "filename": "A04_peacock_blue_marigold.jpg",
        "group": "gold",
        "name": "Peacock Blue with Marigold Petals",
        "elements": ["velvet", "marigold petals", "Indian festive"],
        "prompt": (
            "Peacock blue velvet cloth spread flat with scattered fresh bright orange and yellow marigold petals "
            "arranged decoratively around the edges, center kept empty for jewelry display, "
            "warm golden studio lighting, rich blue fabric texture, festive Indian jewelry photography mood, "
            "no bangles or jewelry in the scene, ultra realistic, 4K commercial quality."
        ),
    },
    {
        "id": "A05",
        "filename": "A05_forest_green_gold_ribbon.jpg",
        "group": "gold",
        "name": "Forest Green Velvet Gold Ribbon",
        "elements": ["velvet", "gold ribbon", "elegant"],
        "prompt": (
            "Deep forest green velvet surface with a fine antique gold braided ribbon border along the edge, "
            "small gold tassel accent in one corner, professional jewelry photography backdrop, "
            "warm overhead studio lighting, empty center ready for product placement, "
            "rich dark green fabric texture, no objects on surface, no text, ultra realistic, 4K."
        ),
    },
    {
        "id": "A06",
        "filename": "A06_teal_velvet_brass_pin.jpg",
        "group": "gold",
        "name": "Teal Velvet with Brass Ornament",
        "elements": ["velvet", "brass ornament", "rich teal"],
        "prompt": (
            "Deep teal velvet cloth with a small decorative antique brass ornamental pin in one corner, "
            "fabric slightly draped to show texture and depth, warm studio lighting from the left, "
            "empty center for jewelry display, rich jewel-toned fabric, professional product photography backdrop, "
            "no jewelry or bangles visible, no text, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "A07",
        "filename": "A07_terracotta_silk_fringe.jpg",
        "group": "gold",
        "name": "Terracotta Silk Fringe",
        "elements": ["silk", "fringe", "warm terracotta"],
        "prompt": (
            "Terracotta orange silk fabric with a thick gold braided fringe trim along one side, "
            "fabric laid flat with gentle texture, warm amber studio lighting, "
            "empty surface for jewelry placement, rich earthy warm color tones, "
            "luxury Indian jewelry photography aesthetic, no objects placed on it, ultra realistic, 4K."
        ),
    },
    {
        "id": "A08",
        "filename": "A08_black_velvet_gold_petals.jpg",
        "group": "gold",
        "name": "Black Velvet Gold Rose Petals",
        "elements": ["black velvet", "gold rose petals", "dramatic"],
        "prompt": (
            "Deep black velvet surface with a few scattered golden dried rose petals arranged near one edge, "
            "warm golden spotlight from directly above center, dramatic luxury jewelry photography backdrop, "
            "petals catch the warm light, empty center for product display, rich black fabric, "
            "no jewelry visible, ultra realistic commercial photography, 4K quality."
        ),
    },
    {
        "id": "A09",
        "filename": "A09_ivory_velvet_gold_trim.jpg",
        "group": "gold",
        "name": "Ivory Velvet Gold Embroidered Cushion",
        "elements": ["ivory velvet", "gold embroidery", "cushion", "fringe"],
        "prompt": (
            "Ivory cream velvet display cushion with a wide ornate gold embroidered border and small gold fringe trim, "
            "wedding jewelry photography aesthetic, soft warm diffused lighting from above, "
            "cream fabric texture, empty center for bangle placement, elegant and bridal mood, "
            "no jewelry on the cushion, no text, ultra realistic 4K luxury photography."
        ),
    },
    {
        "id": "A10",
        "filename": "A10_mahogany_gold_velvet.jpg",
        "group": "gold",
        "name": "Mahogany Wood Gold Velvet",
        "elements": ["dark wood", "gold velvet", "classic luxury"],
        "prompt": (
            "Dark mahogany wooden display surface with a piece of deep gold velvet cloth draped softly over part of it, "
            "warm studio lighting from above, rich wood grain texture visible, "
            "gold fabric edge catching the light, empty center for jewelry, "
            "classic luxury jewelry boutique aesthetic, no jewelry visible, ultra realistic, 4K."
        ),
    },
    {
        "id": "A11",
        "filename": "A11_maroon_brocade_indian.jpg",
        "group": "gold",
        "name": "Maroon Brocade Traditional",
        "elements": ["brocade", "traditional Indian", "maroon", "gold zari"],
        "prompt": (
            "Rich maroon Indian brocade silk fabric with gold zari woven traditional motifs throughout, "
            "laid flat showing the intricate pattern, warm golden lighting, "
            "empty center area for jewelry placement, traditional Indian wedding jewelry photography mood, "
            "rich jewel tones, no jewelry or objects placed on it, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "A12",
        "filename": "A12_plum_velvet_rose_ribbon.jpg",
        "group": "gold",
        "name": "Deep Plum Velvet Rose Ribbon",
        "elements": ["plum velvet", "rose", "ribbon", "elegant"],
        "prompt": (
            "Deep plum purple velvet surface with a single fresh red rose placed in one corner and a gold silk ribbon "
            "loosely draped near it, warm amber side lighting, rich purple fabric texture, "
            "empty center for jewelry display, romantic luxury jewelry photography backdrop, "
            "no bangles or jewelry in the scene, ultra realistic 4K."
        ),
    },

    # ══════════════════════════════════════════════════════════════
    # GROUP B — Antique Gold / Oxidized / Heritage finish  (8 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "B01",
        "filename": "B01_aged_leather_marigold.jpg",
        "group": "antique",
        "name": "Aged Leather Dried Marigold",
        "elements": ["leather", "dried marigold", "vintage", "brass"],
        "prompt": (
            "Dark aged leather display tray with a fine brass rim, scattered dried orange marigold petals "
            "arranged around the edges, warm amber vintage lighting, rich dark brown leather texture, "
            "empty center for jewelry placement, heritage antique jewelry photography mood, "
            "no jewelry visible, ultra realistic 4K product photography."
        ),
    },
    {
        "id": "B02",
        "filename": "B02_antique_box_red_velvet.jpg",
        "group": "antique",
        "name": "Antique Box Red Velvet Lining",
        "elements": ["wooden jewelry box", "red velvet lining", "vintage"],
        "prompt": (
            "Interior of an antique dark wooden jewelry box lined with deep red velvet fabric, "
            "slightly worn velvet texture showing character, warm soft lighting from above, "
            "empty interior ready for jewelry, dark aged wood visible on the frame edges, "
            "heritage luxury jewelry photography, no jewelry inside, ultra realistic 4K."
        ),
    },
    {
        "id": "B03",
        "filename": "B03_dark_wood_brass_ornament.jpg",
        "group": "antique",
        "name": "Dark Weathered Wood Brass",
        "elements": ["weathered wood", "brass ornaments", "vintage"],
        "prompt": (
            "Dark weathered rustic wooden surface with beautiful grain texture, a small antique brass decorative element "
            "in one corner, warm vintage lighting casting long soft shadows, aged character and patina, "
            "empty center for product display, antique jewelry boutique aesthetic, "
            "no jewelry or objects in center, ultra realistic 4K photography."
        ),
    },
    {
        "id": "B04",
        "filename": "B04_jute_silk_earthy_fringe.jpg",
        "group": "antique",
        "name": "Jute Silk Earthy Fringe",
        "elements": ["jute", "silk", "earthy fringe", "natural"],
        "prompt": (
            "Combination of natural jute and dark silk fabric laid flat with earthy-toned fringe trim along one edge, "
            "organic natural texture, warm earthy studio lighting, handcraft artisan jewelry photography mood, "
            "empty center for product, muted earthy color palette of browns and golds, "
            "no jewelry visible, ultra realistic 4K product photography."
        ),
    },
    {
        "id": "B05",
        "filename": "B05_stone_jasmine_marigold.jpg",
        "group": "antique",
        "name": "Stone Surface Jasmine Marigold",
        "elements": ["stone surface", "jasmine", "marigold", "traditional"],
        "prompt": (
            "Rough natural stone surface with a scattering of fresh white jasmine flowers and orange marigold petals "
            "arranged elegantly around the edges, natural warm lighting, earthy stone texture, "
            "empty stone surface in center for jewelry, traditional Indian religious jewelry photography mood, "
            "no jewelry present, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "B06",
        "filename": "B06_copper_patina_rose.jpg",
        "group": "antique",
        "name": "Copper Patina Rose Petals",
        "elements": ["copper", "patina", "rose petals", "vintage"],
        "prompt": (
            "Antique copper display plate with beautiful aged green-gold patina showing across the surface, "
            "a few scattered dark red rose petals placed near one edge, warm amber lighting, "
            "rich metallic aged texture, empty center for jewelry display, vintage luxury aesthetic, "
            "no jewelry on surface, ultra realistic 4K product photography."
        ),
    },
    {
        "id": "B07",
        "filename": "B07_dark_wood_dried_flowers.jpg",
        "group": "antique",
        "name": "Dark Wood Dried Botanical",
        "elements": ["dark wood", "dried flowers", "botanical", "heritage"],
        "prompt": (
            "Deep dark walnut wood surface with small dried botanical flowers and leaves arranged in a cluster "
            "in one corner, warm soft vintage lighting, deep wood grain texture, "
            "empty center for jewelry placement, heritage antique jewelry photography mood, "
            "no bangles or objects in center, ultra realistic 4K photography."
        ),
    },
    {
        "id": "B08",
        "filename": "B08_zari_silk_traditional.jpg",
        "group": "antique",
        "name": "Traditional Zari Silk",
        "elements": ["zari", "silk", "traditional Indian", "dark"],
        "prompt": (
            "Dark traditional Indian silk fabric with intricate gold zari thread work woven in traditional motifs "
            "throughout the surface, shot flat lay, warm golden lighting picking up the thread shimmer, "
            "rich dark fabric color, empty center area for jewelry display, "
            "opulent Indian heritage jewelry photography, no objects placed on it, ultra realistic 4K."
        ),
    },

    # ══════════════════════════════════════════════════════════════
    # GROUP C — Silver / Rhodium / White Gold / Cool-toned  (12 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "C01",
        "filename": "C01_navy_velvet_silver_fringe.jpg",
        "group": "silver",
        "name": "Midnight Navy Velvet Silver Fringe",
        "elements": ["navy velvet", "silver fringe", "cushion", "pearl"],
        "prompt": (
            "Midnight navy blue velvet jewelry display cushion with fine silver thread border and pearl-white "
            "fringe trim along the edges, professional jewelry photography backdrop, "
            "cool blue-tinted studio lighting from above, rich dark fabric texture, "
            "empty center surface, no jewelry placed on it, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "C02",
        "filename": "C02_royal_blue_white_lace.jpg",
        "group": "silver",
        "name": "Royal Blue White Lace Fringe",
        "elements": ["royal blue velvet", "white lace", "fringe"],
        "prompt": (
            "Deep royal blue velvet surface with delicate white lace fringe trim cascading along one edge, "
            "cool silver-tinted studio lighting, rich blue fabric texture, elegant and refined mood, "
            "empty center for jewelry placement, no objects or jewelry visible, "
            "luxury jewelry photography backdrop, ultra realistic 4K quality."
        ),
    },
    {
        "id": "C03",
        "filename": "C03_slate_grey_silk_ribbon.jpg",
        "group": "silver",
        "name": "Slate Grey Silk Silver Ribbon",
        "elements": ["grey silk", "silver ribbon", "minimal", "elegant"],
        "prompt": (
            "Cool slate grey silk fabric laid flat with a thin silver satin ribbon loosely placed diagonally, "
            "soft cool-toned studio lighting from above, smooth silk sheen visible, "
            "empty center for jewelry, minimal and modern luxury photography aesthetic, "
            "no jewelry present, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "C04",
        "filename": "C04_black_velvet_silver_shimmer.jpg",
        "group": "silver",
        "name": "Black Velvet Silver Shimmer",
        "elements": ["black velvet", "silver shimmer", "dramatic", "crystal"],
        "prompt": (
            "Deep black velvet surface with subtle silver shimmer particles scattered near the edges, "
            "a tiny cluster of small crystal elements in one corner catching light, "
            "cool white spotlight from above, dramatic jewelry photography backdrop, "
            "empty center for product, no jewelry or bangles visible, ultra realistic 4K."
        ),
    },
    {
        "id": "C05",
        "filename": "C05_prussian_blue_organza.jpg",
        "group": "silver",
        "name": "Prussian Blue White Organza Frills",
        "elements": ["prussian blue", "organza frills", "delicate"],
        "prompt": (
            "Deep prussian blue velvet surface with soft white organza fabric ruffles and frills "
            "gathered along one edge like a decorative border, cool studio lighting, "
            "the organza catches soft highlights, empty center for jewelry display, "
            "elegant luxury jewelry photography, no jewelry present, ultra realistic 4K."
        ),
    },
    {
        "id": "C06",
        "filename": "C06_steel_blue_crystal_drops.jpg",
        "group": "silver",
        "name": "Steel Blue Satin Crystal Drops",
        "elements": ["steel blue satin", "crystal drops", "shimmer"],
        "prompt": (
            "Steel blue satin fabric with a few small crystal droplets scattered near the edges catching light, "
            "cool silver-blue studio lighting with gentle shimmer effect, "
            "smooth satin texture with visible sheen, empty center for jewelry, "
            "modern luxury jewelry photography, no objects in center, ultra realistic 4K quality."
        ),
    },
    {
        "id": "C07",
        "filename": "C07_emerald_velvet_silver_border.jpg",
        "group": "silver",
        "name": "Emerald Velvet Silver Border",
        "elements": ["emerald velvet", "silver embellishment", "braided border"],
        "prompt": (
            "Deep jewel-toned emerald green velvet with a silver embellished braided border trim along the edges, "
            "cool overhead studio lighting picking up the silver thread detail, "
            "rich deep green fabric texture, empty center for jewelry placement, "
            "luxury jewelry boutique photography, no jewelry visible, ultra realistic 4K."
        ),
    },
    {
        "id": "C08",
        "filename": "C08_lavender_grey_silver_tassel.jpg",
        "group": "silver",
        "name": "Lavender Grey Silver Tassel",
        "elements": ["lavender grey", "silver tassel", "cushion", "soft"],
        "prompt": (
            "Cool lavender grey silk cushion with fine silver tassel trim along the edges, "
            "soft cool-toned diffused studio lighting, smooth fabric texture, "
            "elegant and sophisticated mood, empty surface for jewelry display, "
            "no jewelry placed on it, luxury product photography, ultra realistic 4K quality."
        ),
    },
    {
        "id": "C09",
        "filename": "C09_indigo_velvet_pearl.jpg",
        "group": "silver",
        "name": "Indigo Velvet Pearl Detail",
        "elements": ["indigo velvet", "pearl", "cushion", "fine"],
        "prompt": (
            "Dark indigo blue velvet display cushion with tiny pearl bead detail stitched along the border, "
            "cool neutral studio lighting from above, deep indigo fabric absorbing light, "
            "empty cushion surface for jewelry, refined minimalist jewelry photography, "
            "no jewelry on surface, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "C10",
        "filename": "C10_charcoal_white_marble.jpg",
        "group": "silver",
        "name": "Charcoal Velvet White Marble",
        "elements": ["charcoal velvet", "white marble", "minimal", "modern"],
        "prompt": (
            "Piece of charcoal grey velvet cloth resting on a white Carrara marble surface, "
            "cool natural studio lighting, marble veining visible in background, "
            "velvet in foreground with empty center for jewelry placement, "
            "modern minimalist luxury jewelry photography, no jewelry visible, ultra realistic 4K."
        ),
    },
    {
        "id": "C11",
        "filename": "C11_gunmetal_platinum_thread.jpg",
        "group": "silver",
        "name": "Gunmetal Velvet Platinum Thread",
        "elements": ["gunmetal grey", "platinum thread", "geometric", "fine"],
        "prompt": (
            "Gunmetal dark grey velvet surface with fine platinum thread woven in a subtle geometric border pattern "
            "along the edges, cool overhead lighting, sophisticated and modern luxury aesthetic, "
            "empty center for jewelry display, no jewelry or objects visible, "
            "ultra realistic 4K professional commercial photography."
        ),
    },
    {
        "id": "C12",
        "filename": "C12_ocean_teal_white_feather.jpg",
        "group": "silver",
        "name": "Ocean Teal White Feather",
        "elements": ["ocean teal", "white feather", "ethereal", "silk"],
        "prompt": (
            "Deep ocean teal silk fabric with a single delicate white fluffy feather resting gently near one corner, "
            "cool soft lighting, smooth silk sheen visible, ethereal luxury jewelry photography mood, "
            "empty center for product placement, no jewelry or bangles visible, "
            "ultra realistic 4K commercial photography."
        ),
    },

    # ══════════════════════════════════════════════════════════════
    # GROUP D — Rose Gold / Pink / Champagne-toned bangles  (8 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "D01",
        "filename": "D01_blush_mauve_lace_frills.jpg",
        "group": "rose_gold",
        "name": "Blush Mauve Lace Frills",
        "elements": ["blush mauve", "lace frills", "silk", "delicate"],
        "prompt": (
            "Blush mauve silk fabric with delicate ivory lace ruffle frills gathered along one edge, "
            "soft warm-neutral studio lighting, smooth silk texture with gentle sheen, "
            "romantic and feminine luxury jewelry photography backdrop, empty center for product, "
            "no jewelry visible, no text, ultra realistic 4K quality."
        ),
    },
    {
        "id": "D02",
        "filename": "D02_dusty_rose_velvet_fringe.jpg",
        "group": "rose_gold",
        "name": "Dusty Rose Velvet Cream Fringe",
        "elements": ["dusty rose velvet", "cream fringe", "cushion"],
        "prompt": (
            "Dusty rose velvet jewelry display cushion with cream silk fringe trim along all edges, "
            "soft warm studio lighting, muted rose fabric texture, elegant and romantic mood, "
            "empty cushion surface for jewelry, no objects placed on it, "
            "luxury bridal jewelry photography, ultra realistic 4K."
        ),
    },
    {
        "id": "D03",
        "filename": "D03_peach_satin_rose_petals.jpg",
        "group": "rose_gold",
        "name": "Peach Satin Rose Petals",
        "elements": ["peach satin", "blush rose petals", "scattered"],
        "prompt": (
            "Peach satin fabric with soft blush pink rose petals scattered decoratively around the edges, "
            "center kept clear for jewelry display, warm soft diffused lighting, "
            "smooth satin surface with gentle sheen catching light, romantic Indian bridal jewelry mood, "
            "no jewelry in center, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "D04",
        "filename": "D04_champagne_satin_tulle_frills.jpg",
        "group": "rose_gold",
        "name": "Champagne Satin Tulle Frills",
        "elements": ["champagne satin", "tulle ruffles", "frills", "bridal"],
        "prompt": (
            "Champagne-colored satin fabric with layers of soft blush tulle ruffles and frills "
            "decorating one side, creating a romantic ruffled border, soft warm-toned lighting, "
            "luxurious bridal jewelry photography backdrop, empty center for product display, "
            "no jewelry visible, ultra realistic 4K quality."
        ),
    },
    {
        "id": "D05",
        "filename": "D05_antique_pink_champagne_tassel.jpg",
        "group": "rose_gold",
        "name": "Antique Pink Champagne Tassel",
        "elements": ["antique pink velvet", "champagne tassel", "vintage"],
        "prompt": (
            "Antique dusty pink velvet surface with champagne-colored silk tassel trim cascading from one edge, "
            "warm soft vintage-toned lighting, aged velvet texture with character, "
            "vintage romantic jewelry photography mood, empty center for jewelry placement, "
            "no jewelry present, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "D06",
        "filename": "D06_coral_silk_ivory_bow.jpg",
        "group": "rose_gold",
        "name": "Soft Coral Silk Ivory Bow",
        "elements": ["coral silk", "ivory ribbon bow", "pearl", "delicate"],
        "prompt": (
            "Soft coral silk fabric with a delicate ivory ribbon bow and a few tiny pearl beads placed in one corner, "
            "warm soft studio lighting, smooth silk sheen, feminine luxury jewelry photography backdrop, "
            "empty center for product display, romantic bridal mood, "
            "no jewelry visible, ultra realistic 4K."
        ),
    },
    {
        "id": "D07",
        "filename": "D07_lilac_velvet_pearl_border.jpg",
        "group": "rose_gold",
        "name": "Lilac Velvet Pearl Border",
        "elements": ["lilac velvet", "pearl bead border", "soft purple", "fine"],
        "prompt": (
            "Soft lilac purple velvet surface with a delicate pearl bead border stitched along all edges, "
            "soft diffused neutral lighting, smooth velvet texture, "
            "elegant and feminine luxury jewelry photography backdrop, empty center for jewelry, "
            "no objects placed on surface, ultra realistic 4K quality."
        ),
    },
    {
        "id": "D08",
        "filename": "D08_pink_brocade_gold_frill.jpg",
        "group": "rose_gold",
        "name": "Pink Brocade Gold Frill",
        "elements": ["pink brocade", "gold frill", "traditional"],
        "prompt": (
            "Warm pink Indian brocade silk fabric with a gold frill and tassel trim along one edge, "
            "traditional Indian motif woven into the fabric, warm golden lighting, "
            "flat lay showing the brocade pattern, empty center for jewelry display, "
            "Indian bridal jewelry photography aesthetic, no jewelry present, ultra realistic 4K."
        ),
    },

    # ══════════════════════════════════════════════════════════════
    # GROUP E — Heavy / Wide / Statement bangles (12MM+, Double Decker)  (6 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "E01",
        "filename": "E01_black_velvet_gold_spotlight.jpg",
        "group": "statement",
        "name": "Black Velvet Gold Spotlight",
        "elements": ["black velvet", "gold spotlight", "dramatic", "luxe"],
        "prompt": (
            "Deep black velvet surface with a single focused warm golden spotlight beam illuminating the center, "
            "creating a dramatic circular pool of warm light surrounded by darkness, "
            "high-end luxury jewelry photography, empty lit center for product display, "
            "no jewelry or objects in scene, ultra realistic 4K dramatic product photography."
        ),
    },
    {
        "id": "E02",
        "filename": "E02_midnight_jewel_tones.jpg",
        "group": "statement",
        "name": "Midnight Velvet Jewel Accents",
        "elements": ["midnight velvet", "jewel tones", "gems scattered", "dramatic"],
        "prompt": (
            "Deep midnight blue-black velvet surface with tiny jewel-toned decorative gemstone accents "
            "scattered near the corners, dramatic studio lighting from directly above, "
            "a sense of depth and luxury, empty center for large jewelry piece display, "
            "high-end statement jewelry photography, no bangles visible, ultra realistic 4K."
        ),
    },
    {
        "id": "E03",
        "filename": "E03_deep_purple_amethyst.jpg",
        "group": "statement",
        "name": "Deep Purple Velvet Amethyst",
        "elements": ["purple velvet", "amethyst crystal", "dramatic", "gem"],
        "prompt": (
            "Deep royal purple velvet surface with a small natural amethyst crystal cluster placed in one corner, "
            "dramatic cool-warm studio lighting, rich purple fabric texture, "
            "opulent statement jewelry photography backdrop, empty center for product, "
            "no jewelry or bangles placed on surface, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "E04",
        "filename": "E04_charcoal_gold_leaf.jpg",
        "group": "statement",
        "name": "Charcoal Fabric Gold Leaf",
        "elements": ["charcoal fabric", "gold leaf", "luxury", "editorial"],
        "prompt": (
            "Dark charcoal textured fabric with delicate scattered gold leaf flakes near the edges, "
            "warm golden studio lighting catching the gold leaf shimmer, editorial luxury mood, "
            "empty center for large statement jewelry display, dramatic and sophisticated, "
            "no jewelry in scene, ultra realistic 4K editorial product photography."
        ),
    },
    {
        "id": "E05",
        "filename": "E05_garnet_velvet_shadows.jpg",
        "group": "statement",
        "name": "Deep Garnet Velvet Dramatic Shadows",
        "elements": ["garnet red velvet", "deep shadows", "dramatic", "bold"],
        "prompt": (
            "Deep garnet red velvet surface with strong directional side lighting creating dramatic dark shadows "
            "on one side and warm highlights on the other, bold luxury jewelry photography, "
            "rich red fabric texture, empty center with beautiful light gradient, "
            "statement jewelry display, no jewelry present, ultra realistic 4K."
        ),
    },
    {
        "id": "E06",
        "filename": "E06_obsidian_bronze_clasp.jpg",
        "group": "statement",
        "name": "Obsidian Black Bronze Clasp",
        "elements": ["obsidian black silk", "bronze ornament", "architectural", "luxury"],
        "prompt": (
            "Obsidian black silk fabric with a single ornate antique bronze decorative clasp ornament "
            "placed in one corner, architectural and dramatic studio lighting, "
            "smooth black silk catching subtle highlights, ultra-luxury editorial jewelry photography, "
            "empty center for statement piece display, no jewelry visible, ultra realistic 4K."
        ),
    },

    # ══════════════════════════════════════════════════════════════
    # GROUP F — Delicate / Fine / Thin bangles (3MM–6MM)  (4 total)
    # ══════════════════════════════════════════════════════════════

    {
        "id": "F01",
        "filename": "F01_ivory_silk_lace_cushion.jpg",
        "group": "delicate",
        "name": "Ivory Silk Lace Cushion",
        "elements": ["ivory silk", "lace trim", "cushion", "airy", "bridal"],
        "prompt": (
            "Soft ivory silk cushion with a delicate white lace trim border, airy and light feel, "
            "soft diffused warm-neutral lighting from above, smooth fabric texture, "
            "clean bright and elegant jewelry photography backdrop, empty cushion surface, "
            "bridal fine jewelry aesthetic, no jewelry placed on it, ultra realistic 4K."
        ),
    },
    {
        "id": "F02",
        "filename": "F02_champagne_babys_breath.jpg",
        "group": "delicate",
        "name": "Champagne Satin Baby's Breath",
        "elements": ["champagne satin", "baby's breath flowers", "ribbon", "light"],
        "prompt": (
            "Light champagne satin fabric with tiny white baby's breath flowers and green leaves "
            "scattered delicately near one corner, a thin cream ribbon loosely placed nearby, "
            "soft diffused warm lighting, airy and feminine jewelry photography, "
            "empty center for fine jewelry, no bangles in scene, ultra realistic 4K."
        ),
    },
    {
        "id": "F03",
        "filename": "F03_cream_velvet_embossed_floral.jpg",
        "group": "delicate",
        "name": "Cream Velvet Embossed Floral",
        "elements": ["cream velvet", "embossed floral", "pearl detail", "fine"],
        "prompt": (
            "Cream velvet fabric with a fine embossed floral pattern subtly visible in the fabric texture, "
            "tiny pearl bead details stitched near the border, soft warm-neutral overhead lighting, "
            "refined and delicate luxury jewelry photography backdrop, empty center for fine jewelry, "
            "no objects or jewelry placed on it, ultra realistic 4K commercial photography."
        ),
    },
    {
        "id": "F04",
        "filename": "F04_pale_gold_silk_pearl_ribbon.jpg",
        "group": "delicate",
        "name": "Pale Gold Silk Pearl Ribbon",
        "elements": ["pale gold silk", "pearl", "fine ribbon", "delicate"],
        "prompt": (
            "Pale gold silk fabric with a fine delicate ribbon and three small pearls arranged near one edge, "
            "soft warm golden-neutral lighting, smooth silk catching light with a soft glow, "
            "refined luxury fine jewelry photography, empty center for delicate piece display, "
            "no jewelry visible, ultra realistic 4K quality."
        ),
    },
]

# ─── GROUP MAPPING (for Gemini selection prompt) ────────────────────────────
BACKDROP_LIST_FOR_GEMINI = "\n".join([
    f"{b['id']} | {b['name']} | suits: {b['group']}"
    for b in BACKDROPS
])


def export_prompts():
    """Export all 50 prompts to a text file for manual Google Flow generation"""
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backdrop_prompts_for_google_flow.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("SIDDHI BANGLES — 50 LUXURY BACKDROP PROMPTS FOR GOOGLE FLOW\n")
        f.write("=" * 65 + "\n")
        f.write("Instructions:\n")
        f.write("1. Open labs.google/fx/tools/flow in your browser\n")
        f.write("2. For each backdrop below, paste the prompt into Google Flow\n")
        f.write("3. Generate the image and download it\n")
        f.write("4. Save with the EXACT filename shown (e.g. A01_crimson_velvet_cushion.jpg)\n")
        f.write(f"5. Put all downloaded images into this folder:\n   {OUTPUT_FOLDER}\n")
        f.write("=" * 65 + "\n\n")

        current_group = None
        for b in BACKDROPS:
            group_letter = b["id"][0]
            if group_letter != current_group:
                current_group = group_letter
                group_labels = {
                    "A": "GROUP A — Gold / Yellow Gold / Warm-toned bangles",
                    "B": "GROUP B — Antique Gold / Oxidized / Heritage finish bangles",
                    "C": "GROUP C — Silver / Rhodium / White Gold / Cool-toned bangles",
                    "D": "GROUP D — Rose Gold / Pink / Champagne-toned bangles",
                    "E": "GROUP E — Heavy / Wide / Statement bangles (12MM+, Double Decker)",
                    "F": "GROUP F — Delicate / Fine / Thin bangles (3MM–6MM)",
                }
                f.write("\n" + "─" * 65 + "\n")
                f.write(group_labels.get(group_letter, f"GROUP {group_letter}") + "\n")
                f.write("─" * 65 + "\n\n")

            f.write(f"BACKDROP {b['id']} — {b['name']}\n")
            f.write(f"Save file as: {b['filename']}\n")
            f.write(f"PROMPT:\n{b['prompt']}\n\n")

    print(f"\n✓ Prompts exported to:\n  {out_path}\n")
    print("Open that text file and follow the instructions inside.")
    print("Once all 50 images are in the backdrops/ folder, run enhance_bangles.py\n")


def generate_with_imagen():
    """Auto-generate all 50 using Imagen 3 API (~$2 one-time cost)"""
    if API_KEY == "YOUR_API_KEY_HERE":
        print("\n⚠  Add your API key on line 25 before using auto mode.\n")
        sys.exit(1)

    import subprocess
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Installing google-genai...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-genai", "-q"])
        from google import genai
        from google.genai import types

    from io import BytesIO
    try:
        from PIL import Image
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
        from PIL import Image

    client = genai.Client(api_key=API_KEY)
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    print(f"\nGenerating {len(BACKDROPS)} backdrop images with Imagen 3...")
    print(f"Estimated cost: ~${len(BACKDROPS) * 0.04:.2f} (one-time)\n")

    success = 0
    for i, b in enumerate(BACKDROPS):
        out_path = os.path.join(OUTPUT_FOLDER, b["filename"])
        if os.path.exists(out_path):
            print(f"  [{i+1:02d}/{len(BACKDROPS)}] SKIP (already exists): {b['filename']}")
            success += 1
            continue
        try:
            result = client.models.generate_images(
                model="imagen-3.0-generate-001",
                prompt=b["prompt"],
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio="1:1",
                    safety_filter_level="BLOCK_LOW_AND_ABOVE",
                    person_generation="DONT_ALLOW",
                ),
            )
            img_bytes = result.generated_images[0].image.image_bytes
            img = Image.open(BytesIO(img_bytes))
            img.save(out_path, "JPEG", quality=95)
            print(f"  [{i+1:02d}/{len(BACKDROPS)}] ✓ {b['filename']}")
            success += 1
        except Exception as e:
            print(f"  [{i+1:02d}/{len(BACKDROPS)}] ✗ {b['filename']}: {e}")

    print(f"\n{'='*55}")
    print(f"  Done! {success}/{len(BACKDROPS)} backdrops generated.")
    print(f"  Saved to: {OUTPUT_FOLDER}")
    print(f"  Now run enhance_bangles.py to process your bangles.")
    print(f"{'='*55}\n")


def main():
    print("\n" + "═" * 55)
    print("  Siddhi Bangles — Backdrop Generator (50 backdrops)")
    print("═" * 55 + "\n")

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    if MODE == "export":
        print("Mode: EXPORT — writing all 50 prompts to a text file")
        print("You will paste these prompts into Google Flow to generate images.\n")
        export_prompts()
    elif MODE == "auto":
        print("Mode: AUTO — generating all 50 images with Imagen 3 (~$2 one-time)\n")
        generate_with_imagen()
    else:
        print(f'⚠  Unknown MODE "{MODE}". Set MODE to "export" or "auto".')


if __name__ == "__main__":
    main()
