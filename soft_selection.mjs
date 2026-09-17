/******************************************************************************\
# soft_selection                                 #       Maximum Tension       #
################################################################################
#                                                #      -__            __-     #
# Teoman Deniz                                   #  :    :!1!-_    _-!1!:    : #
# maximum-tension.com                            #  ::                      :: #
#                                                #  :!:    : :: : :  :  ::::!: #
# +.....................++.....................+ #   :!:: :!:!1:!:!::1:::!!!:  #
# : C - Maximum Tension :: Create - 2026/09/17 : #   ::!::!!1001010!:!11!!::   #
# :---------------------::---------------------: #   :!1!!11000000000011!!:    #
# : License - MIT       :: Update - 2026/09/17 : #    ::::!!!1!!1!!!1!!!::     #
# +.....................++.....................+ #       ::::!::!:::!::::      #
\******************************************************************************/

/*
** ES module entry.
**
**   import soft_selection from "./soft_selection.mjs";
**   soft_selection.start({color: "#E84A8C"});
*/

import "./soft_selection.js";

const	soft_selection = globalThis.soft_selection;

export const	start = soft_selection.start;
export const	stop = soft_selection.stop;
export default	soft_selection;
