import axios from "axios";

export async function buscarEmpresasGooglePlaces({ palavra, cidade, estado }) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    const query = `${palavra} ${cidade} ${estado} Brasil`;

    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
      {
        params: {
          query,
          key: apiKey,
          language: "pt-BR",
          region: "br"
        }
      }
    );

    if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
      console.log("ERRO GOOGLE PLACES:", response.data);
      throw new Error(response.data.error_message || response.data.status);
    }

    return (response.data.results || []).map((place) => ({
      placeId: place.place_id,
      nome: place.name || null,
      endereco: place.formatted_address || null,
      telefone: null,
      site: null,
      googleMapsUri: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      latitude: place.geometry?.location?.lat || null,
      longitude: place.geometry?.location?.lng || null,
      rating: place.rating || null,
      cidade,
      estado,
      palavraChave: palavra,
      segmento: palavra,
      origem: "Google Places"
    }));
  } catch (error) {
    console.log("ERRO GOOGLE PLACES:", error.response?.data || error.message);
    throw new Error(error.message);
  }
}