// These specific source photos place their shoes unusually low in an otherwise
// uniform square canvas. Match the exact original URLs so a replacement photo
// (or a different crop) is never shifted using an outdated adjustment.
const photosWithLowSubjects = new Set([
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/33077e7ea1e74eb1a387b36208d65af4_9366/HYPERBOOST_EDGE_Running_Shoes_Grey_KJ0817_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/22ec0064070548db82b6a73ce2894993_9366/SUPERNOVA_GLIDE_RUNNING_SHOES_Blue_KJ1877_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/56a1beb6b9614eb8bc244d5d6e65edf2_9366/GALAXY_8_RUNNING_SHOES_Blue_KI7977_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/753efeb5c9a14ff6b27a553c275c39fe_9366/Adizero_Boston_13_Running_Shoes_Blue_KI4776_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/969e72a69f1c418b863e39f6e2fe1e32_9366/Galaxy_7_Running_Shoes_Purple_JQ3324_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/93bb5ccee6ee4c68a9246bfedf464092_9366/Runfalcon_5_TR_Running_Shoes_Grey_JQ6965_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/0c2ed18f424446adb1be99f69198f330_9366/Adizero_Adios_Pro_4_Shoes_Yellow_JQ1690_HM1.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/32c68ce485a845eba30dd9e7452dca14_9366/Runfalcon_6_Shoes_Children_Black_KI1768_HM1.jpg',
])

// Only these exact reference photos were checked to have pale, uniform
// backgrounds. Unknown uploads retain their existing presentation.
const photosWithPaleBackgrounds = new Set([
  ...photosWithLowSubjects,
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/70f198b292f8433791442853f0a62c56_9366/Adizero_EVO_SL_Laceless_LIGHTSTRIKEPRO_Running_Shoes_Beige_HQ9534_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/e8d6ed3a62e14fb786639f8e1941123a_9366/Adizero_Adios_9_Running_Shoes_Blue_KH9103_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/bb2d705904ad4e20a6211a2c2c19cdb7_9366/ADIZERO_ADIOS_PRO_5_Running_Shoes_Pink_KI8294_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/7450f0eb67304e26b9e9fa896ecc22aa_9366/ADIZERO_EVO_SL_EXO_Shoes_Grey_KJ0427_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/2834f473b6b34153846ce2a6cf6c2f7d_9366/Duramo_SL_2_Running_Shoes_Beige_KI3159_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/7a52fec334874b88b6354a4cb8baaed6_9366/Terrex_Agravic_4_Trail_Running_Shoes_Grey_KJ3786_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/6a46525aaaad4e34828337dc2895a263_9366/Galaxy_6_Shoes_White_IE8150_01_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/46ada444a6e944aa944b2c23eb4b1d6f_9366/Adizero_EVO_SL_ZIP_NAKED_CPH_W_Shoes_Pink_LC1125_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/3e4185e27533462fb38ddd2be4386258_9366/Adizero_EVO_SL_Hermanos_Koumori_Shoes_Brown_KK2052_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/9fa4cd0dfa4b47769e8fc26be9d8fd30_9366/Adizero_EVO_SL_ZIP_Shoes_Black_KI4797_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/a6f8f4d3ccb0439c9739a5c42a72da7c_9366/Adizero_Pacer_Shoes_Blue_KZ8976_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/4b7aaa9a7e8a463fad6e90389c498ce0_9366/ZENBOOST_Shoes_White_IH9500_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/4da2bc3ea7f44539aad9562a1c6ac991_9366/Duramo_Speed_2_Running_Shoes_White_JQ0619_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/31f1ef34bf4446b8a7da7840d0e8b743_9366/Samba_OG_Shoes_Black_IE3676_01_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/96e85f330de44dd2904546cf67a4f833_9366/ANTHONY_EDWARDS_3_JUNIOR_Shoes_Blue_KH8580_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/1a798fc414084b03bc401d154012316d_9366/VL_MOVE_EL_C_Shoes_White_KH9756_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/7237de013322437fb5fa93c41e59bc07_9366/TENSAUR_RUN_4.0_SHOES_CHILDREN_White_KJ6694_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/a81c16a81dbb44918c3af04f02f4a0d9_9366/Tensaur_Sport_3.0_CF_K_Shoes_White_JQ1840_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_600%2Cf_auto%2Cq_auto/7611598d775a4f36bf33ca4e083f7552_9366/Fortarun_4.0_Shoes_Kids_Black_JQ5193_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/4596b331b0e34df1b447d0b6c7ca905f_9366/ADIDAS_DISNEY_MICKEY_MOUSE_GRAND_COURT_SHOES_KIDS_White_KI9191_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/263f942319b14cd7802dca0202ee3f1f_9366/ADIDAS_DISNEY_VL_COURT_3.0_SHOES_CHILDREN_White_KI9175_01_00_standard.jpg',
  'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/4c785fdf9e57446ab4f878704949faeb_9366/adidas_Disney_Princess_SUPERSTAR_II_COMFORT_CLOSURE_SHOES_White_KJ7476_01_00_standard.jpg',
])

export function shouldBlendProductPhoto(url) {
  return photosWithPaleBackgrounds.has(url)
}

export function shouldRecenterProductPhoto(url) {
  return photosWithLowSubjects.has(url)
}
