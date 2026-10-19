## Register everything you save

Every file in the round's `evidences/` folder gets an `evidence` entry in the execution draft, including status, headers, stderr and log files; an empty file is registered as `text` (an empty stderr is the observation "no errors"). The closure audit rejects files that sit on disk without a record. Before submitting, run `ls` on the folder and match it against your `evidence` list. Delete nothing; if a file does not belong, say so in the observation instead.
