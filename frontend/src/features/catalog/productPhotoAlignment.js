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

export function shouldRecenterProductPhoto(url) {
  return photosWithLowSubjects.has(url)
}
