
export function getTutorialURLs(urlType){
    const quickTourURL = "https://www.ebi.ac.uk/training/online/courses/bioimage-archive-quick-tour"
    return urlType === "submission"? `${quickTourURL}/submitting-data-to-bioimage-archive-2/submission/` : quickTourURL
}
