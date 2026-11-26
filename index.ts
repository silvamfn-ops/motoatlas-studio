import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { poiName, city, category } = await req.json();

    const prompt = `És um curador cultural e autor de guias de viagem rigorosos em Português de Portugal.
Gera uma ficha técnica detalhada e concisa para o seguinte ponto de interesse:
Local: ${poiName}
Cidade/Região: ${city}
Categoria: ${category}

Preenche todos os campos com rigor histórico, arquitetónico e prático para um viajante.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                location_details: { type: "STRING", description: "Morada ou enquadramento geográfico exato" },
                classification: { type: "STRING", description: "Estatuto patrimonial (ex: Património Mundial UNESCO, Monumento Nacional)" },
                construction_period: { type: "STRING", description: "Século, datas de construção e principais fases" },
                dimensions_specs: { type: "STRING", description: "Área, altura, capacidade ou características físicas marcantes" },
                architectural_styles: { type: "STRING", description: "Estilos dominantes (ex: Mudéjar, Renascentista, Barroco)" },
                curiosities: { type: "STRING", description: "2 a 3 factos históricos pouco conhecidos ou detalhes a observar" },
                visitor_tips: { type: "STRING", description: "Melhor hora de visita, bilheteira, estacionamento ou regras de acesso" },
                latitude: { type: "NUMBER" },
                longitude: { type: "NUMBER" }
              },
              required: [
                "location_details", "classification", "construction_period",
                "dimensions_specs", "architectural_styles", "curiosities", "visitor_tips"
              ]
            }
          }
        })
      }
    );

    const data = await response.json();
    const sheetJson = JSON.parse(data.candidates[0].content.parts[0].text);

    return new Response(JSON.stringify(sheetJson), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
