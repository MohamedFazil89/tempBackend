import axios from "axios";

const getLocationName = async (lat, lon) => {
  const { data } = await axios.get(
    "https://api.opencagedata.com/geocode/v1/json",
    {
      params: {
        key: process.env.OPENCAGE_API_KEY,
        q: `${lat},${lon}`,
      },
    }
  );

  const components = data.results[0]?.components;
  return (
    components?.suburb ||
    components?.neighbourhood ||
    components?.city_district ||
    components?.city
  );
};

export default getLocationName;